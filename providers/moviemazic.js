// providers/moviemazic.js
// MovieMazic BDIX provider for Nuvio

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var BASE = 'http://moviemazic.xyz';

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function fetchWatchPage(slug) {
  return fetch(BASE + '/watch/' + slug, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': BASE + '/'
    }
  }).then(function(r) { return r.text(); });
}

function extractStreamUrl(html) {
  var patterns = [
    /file\s*:\s*["']([^"']+\.mp4[^"']*)/i,
    /file\s*:\s*["']([^"']+\.m3u8[^"']*)/i,
    /source\s*:\s*["']([^"']+\.mp4[^"']*)/i,
    /src\s*:\s*["']([^"']+cdn\.moviemazic[^"']+)/i,
    /"url"\s*:\s*"([^"]+cdn\.moviemazic[^"]+)"/i,
    /http:\/\/cdn\.moviemazic\.xyz[^"'\s<>]+\.mp4/i,
    /http:\/\/cdn\.moviemazic\.xyz[^"'\s<>]+\.m3u8/i
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = html.match(patterns[i]);
    if (match) {
      var url = match[1] || match[0];
      url = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      return url;
    }
  }
  return null;
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  var season = media && media.season ? media.season : 1;
  var episode = media && media.episode ? media.episode : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var dateStr = isMovie ? data.release_date : data.first_air_date;
      var year = dateStr ? dateStr.substring(0, 4) : '';

      if (!title || !year) return [];

      var slug = isMovie
        ? slugify(title) + '-' + year + '-movie.html'
        : slugify(title) + '-' + year + '-tv.html';

      console.log('[MovieMazic] Fetching: ' + BASE + '/watch/' + slug);

      return fetchWatchPage(slug).then(function(html) {
        var streamUrl = extractStreamUrl(html);

        if (!streamUrl) {
          console.error('[MovieMazic] Could not extract stream URL');
          var folder = encodeURIComponent(title + ' (' + year + ')');
          var file = encodeURIComponent(title + ' (' + year + ').mp4');
          streamUrl = isMovie
            ? 'http://cdn.moviemazic.xyz:8083/download/movies/' + year + '/' + folder + '/' + file
            : 'http://cdn.moviemazic.xyz:8083/download/tv-series/' + year + '/' + folder + '/Season%20' + season + '/' + encodeURIComponent(title + ' (' + year + ') ' + season + 'x' + episode + '.mp4');
        }

        console.log('[MovieMazic] Stream: ' + streamUrl);

        var label = isMovie
          ? title + ' (' + year + ')'
          : title + ' S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');

        return [{
          name: 'MovieMazic',
          title: label,
          url: streamUrl,
          quality: 'BDIX',
          headers: {
            'Referer': BASE + '/',
            'Origin': BASE,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          }
        }];
      });
    })
    .catch(function(e) {
      console.error('[MovieMazic] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

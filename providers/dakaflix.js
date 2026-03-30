// providers/dakaflix.js
// DhakaFlix BDIX provider for Nuvio
// Uses the built-in search API

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var BASE_URL = 'http://172.16.50.7';
var SERVER = 'DHAKA-FLIX-7';

function searchServer(query) {
  var body = JSON.stringify({
    action: 'get',
    search: {
      href: '/' + SERVER + '/',
      pattern: query,
      ignorecase: true
    }
  });

  return fetch(BASE_URL + '/' + SERVER + '/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    },
    body: body
  }).then(function(r) { return r.json(); });
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  var season = media && media.season ? parseInt(media.season) : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var year = (isMovie ? data.release_date : data.first_air_date || '').substring(0, 4);
      if (!title || !year) return [];

      var normTitle = normalize(title);

      return searchServer(title).then(function(result) {
        if (!result || !result.search) return [];

        var videoExts = ['.mkv', '.mp4', '.avi'];
        var candidates = [];

        result.search.forEach(function(item) {
          if (!item.href) return;
          var href = item.href;
          var decoded = decodeURIComponent(href).toLowerCase();

          // Must contain title and year
          if (decoded.indexOf(normTitle) === -1 && decoded.replace(/[^a-z0-9]/g,'').indexOf(normTitle) === -1) return;
          if (decoded.indexOf(year) === -1) return;

          // Must be a video file (has size) or a folder
          var isVideo = false;
          for (var i = 0; i < videoExts.length; i++) {
            if (decoded.indexOf(videoExts[i]) !== -1) {
              isVideo = true;
              break;
            }
          }

          if (isVideo && item.size) {
            candidates.push({ href: href, size: item.size });
          }
        });

        if (candidates.length === 0) {
          console.error('[DhakaFlix] No results for: ' + title + ' ' + year);
          return [];
        }

        // Pick largest file (best quality)
        candidates.sort(function(a, b) { return b.size - a.size; });
        var best = candidates[0];

        var streamUrl = BASE_URL + best.href;
        console.log('[DhakaFlix] Stream: ' + streamUrl);

        var label = isMovie
          ? title + ' (' + year + ')'
          : title + ' S' + (season < 10 ? '0' + season : season) + 'E' + (episode < 10 ? '0' + episode : episode);

        return [{
          name: 'DhakaFlix',
          title: label,
          url: streamUrl,
          quality: 'BDIX',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          }
        }];
      });
    })
    .catch(function(e) {
      console.error('[DhakaFlix] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

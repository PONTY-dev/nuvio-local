// providers/dakaflix.js
// DhakaFlix BDIX provider for Nuvio
// Movies: 172.16.50.7/DHAKA-FLIX-7
// TV Series: 172.16.50.12/DHAKA-FLIX-12

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';

var MOVIE_BASE = 'http://172.16.50.7';
var MOVIE_SERVER = 'DHAKA-FLIX-7';
var TV_BASE = 'http://172.16.50.12';
var TV_SERVER = 'DHAKA-FLIX-12';

function searchServer(base, server, query) {
  var body = JSON.stringify({
    action: 'get',
    search: { href: '/' + server + '/', pattern: query, ignorecase: true }
  });
  return fetch(base + '/' + server + '/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    },
    body: body
  }).then(function(r) { return r.json(); });
}

function fetchFolder(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    }
  }).then(function(r) { return r.text(); });
}

function findVideoInHtml(html, baseUrl) {
  var re = /href="([^"]+\.(mkv|mp4|avi))"/gi;
  var m = re.exec(html);
  if (!m) return null;
  var href = m[1];
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return baseUrl.replace(/^(https?:\/\/[^\/]+).*/, '$1') + href;
  return baseUrl + href;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildResult(title, year, season, episode, isMovie, url) {
  var label = isMovie
    ? title + ' (' + year + ')'
    : title + ' S' + (season < 10 ? '0' + season : '' + season) + 'E' + (episode < 10 ? '0' + episode : '' + episode);
  return [{
    name: 'DhakaFlix',
    title: label,
    url: url,
    quality: 'BDIX',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    }
  }];
}

function processResults(results, base, title, year, season, episode, isMovie) {
  if (!results || !results.search) return Promise.resolve([]);

  var normTitle = normalize(title);
  var folderMatch = null;
  var fileMatch = null;

  results.search.forEach(function(item) {
    if (!item.href) return;
    var decoded = decodeURIComponent(item.href).toLowerCase();
    var normDecoded = normalize(decoded);

    if (normDecoded.indexOf(normTitle) === -1) return;
    if (decoded.indexOf(year) === -1) return;

    if (item.size === null || item.size === undefined) {
      if (!folderMatch) folderMatch = item.href;
    } else {
      var lower = decoded;
      if ((lower.indexOf('.mkv') !== -1 || lower.indexOf('.mp4') !== -1 || lower.indexOf('.avi') !== -1) && !fileMatch) {
        fileMatch = item.href;
      }
    }
  });

  if (fileMatch) {
    var streamUrl = base + fileMatch;
    console.log('[DhakaFlix] File: ' + streamUrl);
    return Promise.resolve(buildResult(title, year, season, episode, isMovie, streamUrl));
  }

  if (folderMatch) {
    var folderUrl = base + folderMatch;
    if (folderUrl.charAt(folderUrl.length - 1) !== '/') folderUrl += '/';
    console.log('[DhakaFlix] Folder: ' + folderUrl);
    return fetchFolder(folderUrl).then(function(html) {
      var videoUrl = findVideoInHtml(html, folderUrl);
      if (!videoUrl) return [];
      console.log('[DhakaFlix] Video: ' + videoUrl);
      return buildResult(title, year, season, episode, isMovie, videoUrl);
    });
  }

  console.error('[DhakaFlix] No match: ' + title + ' ' + year);
  return Promise.resolve([]);
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  var season = media && media.season ? parseInt(media.season) : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  var base = isMovie ? MOVIE_BASE : TV_BASE;
  var server = isMovie ? MOVIE_SERVER : TV_SERVER;

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var year = (isMovie ? data.release_date : data.first_air_date || '').substring(0, 4);
      if (!title || !year) return [];

      console.log('[DhakaFlix] Searching: ' + title + ' (' + year + ') on ' + server);

      return searchServer(base, server, title)
        .then(function(results) {
          return processResults(results, base, title, year, season, episode, isMovie);
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
// DhakaFlix BDIX provider for Nuvio
// Server: 172.16.50.7

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var BASE = 'http://172.16.50.7/DHAKA-FLIX-7';

function fetchListing(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    }
  }).then(function(r) { return r.text(); });
}

function parseLinks(html) {
  var links = [];
  var regex = /href="([^"]+)"/g;
  var match;
  while ((match = regex.exec(html)) !== null) {
    var href = match[1];
    // Skip parent links, icons, sort links
    if (href === '../' || href === '/' || href.startsWith('?') || href.startsWith('http://172') === false && href.indexOf('/') === 0) continue;
    if (href.startsWith('?')) continue;
    links.push(decodeURIComponent(href.replace(/\/$/, '')));
  }
  return links;
}

function parseLinksRaw(html) {
  var links = [];
  var regex = /href="([^"?][^"]*)"/g;
  var match;
  while ((match = regex.exec(html)) !== null) {
    var href = match[1];
    if (href === '../' || href === '/') continue;
    if (href.startsWith('?')) continue;
    if (href.startsWith('/') && !href.startsWith('/DHAKA')) continue;
    links.push(href);
  }
  return links;
}

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleMatch(folderName, title, year) {
  var norm = normalize(folderName);
  var normTitle = normalize(title);
  var yearStr = String(year);
  return norm.indexOf(normTitle) !== -1 && norm.indexOf(yearStr) !== -1;
}

function getYearFolder(year) {
  var y = parseInt(year);
  if (y <= 1994) return '(1960-1994)';
  return '(' + year + ')';
}

function findMovieFile(folderUrl) {
  return fetchListing(folderUrl).then(function(html) {
    var videoExts = ['.mkv', '.mp4', '.avi', '.mov'];
    var regex = /href="([^"]+)"/g;
    var match;
    while ((match = regex.exec(html)) !== null) {
      var href = match[1];
      if (href === '../' || href.startsWith('?')) continue;
      var lower = href.toLowerCase();
      for (var i = 0; i < videoExts.length; i++) {
        if (lower.indexOf(videoExts[i]) !== -1) {
          // Return full URL
          if (href.startsWith('http')) return href;
          return folderUrl + href;
        }
      }
    }
    return null;
  });
}

function searchInYearFolder(yearFolderUrl, title, year) {
  return fetchListing(yearFolderUrl).then(function(html) {
    var regex = /href="([^"]+)"/g;
    var match;
    var candidates = [];
    while ((match = regex.exec(html)) !== null) {
      var href = match[1];
      if (href === '../' || href.startsWith('?') || href === '/') continue;
      var decoded = decodeURIComponent(href.replace(/\/$/, ''));
      if (titleMatch(decoded, title, year)) {
        candidates.push(href);
      }
    }
    if (candidates.length === 0) return null;
    // Use first match
    var folderUrl = yearFolderUrl + candidates[0];
    if (!folderUrl.endsWith('/')) folderUrl += '/';
    return findMovieFile(folderUrl);
  });
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  var isMovie = type === 'movie';

  // Only movies for now
  if (!isMovie) return Promise.resolve([]);

  var tmdbUrl = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = data.title;
      var dateStr = data.release_date;
      var year = dateStr ? dateStr.substring(0, 4) : '';

      if (!title || !year) return [];

      var yearFolder = getYearFolder(year);
      var yearFolderUrl = BASE + '/English%20Movies/' + encodeURIComponent(yearFolder) + '/';

      console.log('[DhakaFlix] Searching: ' + title + ' (' + year + ')');
      console.log('[DhakaFlix] Year folder: ' + yearFolderUrl);

      return searchInYearFolder(yearFolderUrl, title, year).then(function(streamUrl) {
        if (!streamUrl) {
          console.error('[DhakaFlix] Not found: ' + title);
          return [];
        }
        console.log('[DhakaFlix] Found: ' + streamUrl);
        return [{
          name: 'DhakaFlix',
          title: title + ' (' + year + ')',
          url: streamUrl,
          quality: 'BDIX 720p',
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

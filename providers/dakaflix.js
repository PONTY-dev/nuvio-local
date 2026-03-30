// providers/dakaflix.js
// DhakaFlix BDIX - directory browsing approach

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies';
var TV_BASE = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series';

var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function fetchHtml(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) { return r.text(); });
}

function getHrefs(html) {
  var results = [];
  var re = /href="([^"?#][^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === '/') continue;
    results.push(h);
  }
  return results;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getYearFolder(year) {
  var y = parseInt(year);
  if (y <= 1994) return '(1960-1994)';
  return '(' + year + ')';
}

function getTvAlphaFolder(title) {
  var first = title.trim().charAt(0).toUpperCase();
  if (first >= '0' && first <= '9') return 'TV%20Series%20%E2%98%85%200%20%E2%80%94%209';
  if (first >= 'A' && first <= 'L') return 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L';
  if (first >= 'M' && first <= 'R') return 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R';
  return 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z';
}

function findMatch(hrefs, normTitle, year) {
  // First pass: title + year
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var norm = normalize(dec);
    if (norm.indexOf(normTitle) !== -1 && dec.indexOf(year) !== -1) return hrefs[i];
  }
  // Second pass: title only
  for (var j = 0; j < hrefs.length; j++) {
    var dec2 = decodeURIComponent(hrefs[j]);
    var norm2 = normalize(dec2);
    if (norm2.indexOf(normTitle) !== -1) return hrefs[j];
  }
  return null;
}

function findVideo(hrefs, baseUrl) {
  var exts = ['.mkv', '.mp4', '.avi'];
  for (var i = 0; i < hrefs.length; i++) {
    var lower = hrefs[i].toLowerCase();
    for (var j = 0; j < exts.length; j++) {
      if (lower.indexOf(exts[j]) !== -1) {
        var href = hrefs[i];
        if (href.indexOf('http') === 0) return href;
        if (href.charAt(0) === '/') return 'http://172.16.50.7' + href;
        return baseUrl + href;
      }
    }
  }
  return null;
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
      var year = ((isMovie ? data.release_date : data.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];

      var normTitle = normalize(title);
      var yearFolderUrl, label;

      if (isMovie) {
        yearFolderUrl = MOVIE_BASE + '/' + encodeURIComponent(getYearFolder(year)) + '/';
        label = title + ' (' + year + ')';
      } else {
        yearFolderUrl = TV_BASE + '/' + getTvAlphaFolder(title) + '/';
        label = title + ' S' + (season < 10 ? '0' + season : '' + season) + 'E' + (episode < 10 ? '0' + episode : '' + episode);
      }

      console.log('[DhakaFlix] Browsing: ' + yearFolderUrl);

      return fetchHtml(yearFolderUrl).then(function(html) {
        var hrefs = getHrefs(html);
        var matched = findMatch(hrefs, normTitle, year);

        if (!matched) {
          console.error('[DhakaFlix] No folder match for: ' + title);
          return [];
        }

        var movieUrl = yearFolderUrl + matched;
        if (movieUrl.charAt(movieUrl.length - 1) !== '/') movieUrl += '/';
        console.log('[DhakaFlix] Found: ' + movieUrl);

        return fetchHtml(movieUrl).then(function(html2) {
          var hrefs2 = getHrefs(html2);
          var videoUrl = findVideo(hrefs2, movieUrl);

          if (!videoUrl) {
            console.error('[DhakaFlix] No video in: ' + movieUrl);
            return [];
          }

          console.log('[DhakaFlix] Stream: ' + videoUrl);
          return [{
            name: 'DhakaFlix',
            title: label,
            url: videoUrl,
            quality: 'BDIX',
            headers: { 'User-Agent': UA }
          }];
        });
      });
    })
    .catch(function(e) {
      console.error('[DhakaFlix] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

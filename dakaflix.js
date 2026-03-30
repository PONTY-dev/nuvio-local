// providers/dakaflix.js
// DhakaFlix BDIX provider for Nuvio

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var BASE = 'http://172.16.50.7/DHAKA-FLIX-7';

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fetchText(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': '*/*'
    }
  }).then(function(r) { return r.text(); });
}

function getAllHrefs(html) {
  var results = [];
  var re = /href="([^"]+)"/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === '/' || h.charAt(0) === '?' || h.charAt(0) === '#') continue;
    results.push(h);
  }
  return results;
}

function getYearFolder(year) {
  var y = parseInt(year);
  if (y <= 1994) return '(1960-1994)';
  return '(' + year + ')';
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  if (type !== 'movie') return Promise.resolve([]);

  return fetch('https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = data.title;
      var year = data.release_date ? data.release_date.substring(0, 4) : '';
      if (!title || !year) return [];

      var normTitle = normalize(title);
      var yearFolder = getYearFolder(year);
      var yearUrl = BASE + '/English%20Movies/' + encodeURIComponent(yearFolder) + '/';

      console.log('[DhakaFlix] Looking in: ' + yearUrl);

      return fetchText(yearUrl).then(function(html) {
        var hrefs = getAllHrefs(html);
        var matched = null;

        for (var i = 0; i < hrefs.length; i++) {
          var decoded = decodeURIComponent(hrefs[i]);
          var normFolder = normalize(decoded);
          if (normFolder.indexOf(normTitle) !== -1 && normFolder.indexOf(year) !== -1) {
            matched = hrefs[i];
            break;
          }
        }

        if (!matched) {
          console.error('[DhakaFlix] No folder match for: ' + title + ' ' + year);
          return [];
        }

        var movieFolderUrl = yearUrl + matched;
        if (movieFolderUrl.charAt(movieFolderUrl.length - 1) !== '/') movieFolderUrl += '/';

        console.log('[DhakaFlix] Found folder: ' + movieFolderUrl);

        return fetchText(movieFolderUrl).then(function(html2) {
          var hrefs2 = getAllHrefs(html2);
          var videoExts = ['.mkv', '.mp4', '.avi', '.mov'];
          var videoFile = null;

          for (var j = 0; j < hrefs2.length; j++) {
            var f = hrefs2[j].toLowerCase();
            for (var k = 0; k < videoExts.length; k++) {
              if (f.indexOf(videoExts[k]) !== -1) {
                videoFile = hrefs2[j];
                break;
              }
            }
            if (videoFile) break;
          }

          if (!videoFile) {
            console.error('[DhakaFlix] No video file found in: ' + movieFolderUrl);
            return [];
          }

          var streamUrl = movieFolderUrl + videoFile;
          console.log('[DhakaFlix] Stream: ' + streamUrl);

          return [{
            name: 'DhakaFlix',
            title: title + ' (' + year + ')',
            url: streamUrl,
            quality: 'BDIX',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
            }
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

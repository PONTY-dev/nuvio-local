// providers/dakaflix.js - TEST VERSION
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';

function getStreams(tmdbId, media) {
  // Hardcoded test for 12 Angry Men (1957)
  // TMDB ID for 12 Angry Men is 389
  if (String(tmdbId) === '389') {
    return Promise.resolve([{
      name: 'DhakaFlix',
      title: '12 Angry Men (1957) TEST',
      url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/%281960-1994%29/12%20Angry%20Men%20%281957%29%20720p/12.Angry.Men.1997.720p.BluRay.x264.mkv',
      quality: 'BDIX',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      }
    }]);
  }

  // For everything else, do live lookup
  var isMovie = !media || media.type === 'movie';
  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var year = ((isMovie ? data.release_date : data.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];

      var yearFolder = parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
      var listingUrl = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/' + encodeURIComponent(yearFolder) + '/';

      return fetch(listingUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' }
      }).then(function(r) { return r.text(); })
      .then(function(html) {
        var normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        var re = /href="([^"?#\/][^"]*)"/g;
        var m;
        var matched = null;
        while ((m = re.exec(html)) !== null) {
          var dec = decodeURIComponent(m[1]);
          var norm = dec.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (norm.indexOf(normTitle) !== -1) { matched = m[1]; break; }
        }
        if (!matched) return [];

        var folderUrl = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/' + encodeURIComponent(yearFolder) + '/' + matched;
        if (folderUrl.slice(-1) !== '/') folderUrl += '/';

        return fetch(folderUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' }
        }).then(function(r) { return r.text(); })
        .then(function(html2) {
          var vm = /href="([^"]+\.(mkv|mp4|avi))"/i.exec(html2);
          if (!vm) return [];
          var videoHref = vm[1];
          var videoUrl = videoHref.charAt(0) === '/' ? 'http://172.16.50.7' + videoHref : folderUrl + videoHref;
          return [{
            name: 'DhakaFlix',
            title: title + ' (' + year + ')',
            url: videoUrl,
            quality: 'BDIX',
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' }
          }];
        });
      });
    })
    .catch(function(e) { return []; });
}

module.exports = { getStreams: getStreams };

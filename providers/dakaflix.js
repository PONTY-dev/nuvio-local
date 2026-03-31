// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getYearFolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

function getTvPath(title) {
  var c = title.trim().charAt(0).toUpperCase();
  if (c >= '0' && c <= '9') return 'TV Series \u2605 0 \u2014 9';
  if (c >= 'A' && c <= 'L') return 'TV Series \u2665 A \u2014 L';
  if (c >= 'M' && c <= 'R') return 'TV Series \u2666 M \u2014 R';
  return 'TV Series \u2666 S \u2014 Z';
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

      var listUrl = isMovie
        ? 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/' + encodeURIComponent(getYearFolder(year)) + '/'
        : 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/' + encodeURIComponent(getTvPath(title)) + '/';

      var host = isMovie ? 'http://172.16.50.7' : 'http://172.16.50.12';

      return fetch(listUrl, { headers: { 'User-Agent': UA } })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var re = /href="([^"?#][^"]*)"/g;
          var m;
          var matched = null;
          while ((m = re.exec(html)) !== null) {
            var h = m[1];
            if (h === '../' || h === '/') continue;
            var dec = decodeURIComponent(h);
            if (normalize(dec).indexOf(normTitle) !== -1) {
              matched = h;
              break;
            }
          }
          if (!matched) return [];

          var folderUrl = matched.charAt(0) === '/' ? host + matched : listUrl + matched;
          if (folderUrl.charAt(folderUrl.length - 1) !== '/') folderUrl += '/';

          return fetch(folderUrl, { headers: { 'User-Agent': UA } })
            .then(function(r) { return r.text(); })
            .then(function(html2) {
              var vm = /href="([^"]+\.(mkv|mp4|avi))"/i.exec(html2);
              if (!vm) return [];
              var vh = vm[1];
              var videoUrl = vh.charAt(0) === '/' ? host + vh : folderUrl + vh;
              var label = isMovie
                ? title + ' (' + year + ')'
                : title + ' S' + (season < 10 ? '0' + season : '' + season) + 'E' + (episode < 10 ? '0' + episode : '' + episode);
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
      console.error('[DhakaFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

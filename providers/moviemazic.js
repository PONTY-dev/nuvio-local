// providers/moviemazic.js
// MovieMazic BDIX provider for Nuvio

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var CDN = 'http://cdn.moviemazic.xyz:8083/download';

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

      var folderName = title + ' (' + year + ')';
      var folder = encodeURIComponent(folderName);
      var url, label;

      if (isMovie) {
        url = CDN + '/movies/' + year + '/' + folder + '/' + encodeURIComponent(folderName + '.mp4');
        label = folderName;
      } else {
        var epFile = folderName + ' ' + season + 'x' + episode + '.mp4';
        url = CDN + '/tv-series/' + year + '/' + folder + '/Season%20' + season + '/' + encodeURIComponent(epFile);
        label = title + ' S' + (season < 10 ? '0' + season : '' + season) + 'E' + (episode < 10 ? '0' + episode : '' + episode);
      }

      return [{
        name: 'MovieMazic',
        title: label,
        url: url,
        quality: 'BDIX',
        headers: {
          'Referer': 'http://moviemazic.xyz/',
          'Origin': 'http://moviemazic.xyz',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        }
      }];
    })
    .catch(function(e) {
      console.error('[MovieMazic] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/moviemazic.js
// MovieMazic BDIX provider for Nuvio
// Streams from cdn.moviemazic.xyz:8083

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var CDN = 'http://cdn.moviemazic.xyz:8083/download';

function buildMovieUrl(title, year) {
  var folder = encodeURIComponent(title + ' (' + year + ')');
  var file = encodeURIComponent(title + ' (' + year + ').mp4');
  return CDN + '/movies/' + year + '/' + folder + '/' + file;
}

function buildTvUrl(title, year, season, episode) {
  var folder = encodeURIComponent(title + ' (' + year + ')');
  var seasonPad = season;
  var episodePad = episode;
  var file = encodeURIComponent(
    title + ' (' + year + ') ' + seasonPad + 'x' + episodePad + '.mp4'
  );
  return (
    CDN +
    '/tv-series/' +
    year +
    '/' +
    folder +
    '/Season%20' +
    season +
    '/' +
    file
  );
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
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var title = isMovie ? data.title : data.name;
      var dateStr = isMovie ? data.release_date : data.first_air_date;
      var year = dateStr ? dateStr.substring(0, 4) : '';

      if (!title || !year) return [];

      var url = isMovie
        ? buildMovieUrl(title, year)
        : buildTvUrl(title, year, season, episode);

      var label = isMovie
        ? title + ' (' + year + ')'
        : title + ' S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');

      console.log('[MovieMazic] URL: ' + url);

      return [
        {
          name: 'MovieMazic',
          title: label,
          url: url,
          quality: 'BDIX',
        },
      ];
    })
    .catch(function (e) {
      console.error('[MovieMazic] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function dotTitle(title) {
  return title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
}

function getYearFolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

function getTvFolder(title) {
  var c = title.trim().charAt(0).toUpperCase();
  if (c >= '0' && c <= '9') return 'TV%20Series%20%E2%98%85%200%20%E2%80%94%209';
  if (c >= 'A' && c <= 'L') return 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L';
  if (c >= 'M' && c <= 'R') return 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R';
  return 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z';
}

function getStreams(tmdbId, media) {
  // 1. Properly handle TV IDs which are usually sent as "ID:SEASON:EPISODE"
  var idString = String(tmdbId);
  var parts = idString.split(':');
  var realId = parts[0]; 

  // 2. Safely detect if it's a TV show or Movie based on arguments
  var isTvId = idString.indexOf(':') !== -1;
  var type = media && media.type ? media.type.toLowerCase() : (isTvId ? 'tv' : 'movie');
  if (type === 'series' || type === 'show') type = 'tv';
  var isMovie = type !== 'tv';

  // 3. Extract Season and Episode safely
  var season = media && media.season ? parseInt(media.season) : (parts[1] ? parseInt(parts[1]) : 1);
  var episode = media && media.episode ? parseInt(media.episode) : (parts[2] ? parseInt(parts[2]) : 1);

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + realId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/' + realId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var year = ((isMovie ? data.release_date : data.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];

      var dt = dotTitle(title);
      var folderTitle = encodeURIComponent(title + ' (' + year + ')');
      var results = [];

      if (isMovie) {
        var yf = encodeURIComponent(getYearFolder(year));
        var base = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/' + yf + '/' + folderTitle;
        results = [
          { name: 'DhakaFlix 720p', url: base + '%20720p/' + dt + '.' + year + '.720p.BluRay.x264.mkv' },
          { name: 'DhakaFlix 1080p', url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies%20(1080p)/' + yf + '%201080p/' + folderTitle + '%201080p/' + dt + '.' + year + '.1080p.BluRay.x264.mkv' },
          { name: 'DhakaFlix WEB', url: base + '%20720p/' + dt + '.' + year + '.720p.WEBRip.x264.mkv' }
        ];
      } else {
        var tvf = getTvFolder(title);
        var tvBase = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/' + tvf + '/' + folderTitle;
        var padS = season < 10 ? '0' + season : '' + season;
        var padE = episode < 10 ? '0' + episode : '' + episode;
        var ep = 'S' + padS + 'E' + padE;
        
        results = [
          { name: 'DhakaFlix TV', url: tvBase + '/Season%20' + season + '/' + dt + '.' + ep + '.mkv' },
          { name: 'DhakaFlix TV 2', url: tvBase + '/' + dt + '.' + ep + '.mkv' }
        ];
      }

      return results.map(function(r) {
        return {
          name: r.name,
          title: isMovie 
            ? title + ' (' + year + ')' 
            : title + ' S' + padS + 'E' + padE,
          url: r.url,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        };
      });
    })
    .catch(function(e) {
      console.error('[DhakaFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

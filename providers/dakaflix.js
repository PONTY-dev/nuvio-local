// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function ep(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }

function getStreams(tmdbId, media) {
  var type  = media && media.type ? media.type : 'movie';
  var isMov = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title || d.original_title) : (d.name || d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date) || '').substring(0, 4);

      // Always return a test stream so we can see if TMDB worked
      return [{
        name:    'DhakaFlix TEST - ' + (title || 'NO TITLE') + ' ' + (year || 'NO YEAR'),
        title:   (title || 'unknown') + ' (' + (year || '?') + ')',
        url:     'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/%281960-1994%29/12%20Angry%20Men%20%281957%29%20720p/12.Angry.Men.1997.720p.BluRay.x264.ESub-Pahe.mkv',
        quality: 'BDIX',
        headers: { 'User-Agent': UA }
      }];
    })
    .catch(function(e) {
      return [{
        name:    'DhakaFlix ERROR - ' + e.message,
        title:   'error',
        url:     'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/%281960-1994%29/12%20Angry%20Men%20%281957%29%20720p/12.Angry.Men.1997.720p.BluRay.x264.ESub-Pahe.mkv',
        quality: 'BDIX',
        headers: { 'User-Agent': UA }
      }];
    });
}

module.exports = { getStreams: getStreams };

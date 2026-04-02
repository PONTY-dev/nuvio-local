// providers/dakaflix.js
var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA         = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';
var TV_BASE    = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

// TV range buckets (pre-encoded)
var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function enc(s) { return encodeURIComponent(s); }

// ── Movie URL builder ─────────────────────────────────────────────────────────
// Real observed pattern (from server screenshots):
//   Folder: "Title (Year) 720p NF [Dual Audio]"
//   File:   "Title (Year) 720p NF-WEB x264.mkv"  ← spaces, title repeated
//
// We generate combinations of folder suffixes × file suffixes
// so at least one URL matches what's actually on the server.

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? enc('(1960-1994)') : enc('(' + year + ')');
  var base = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')'; // e.g. "A Journey (2024)"

  // Folder suffix variants seen on server
  var folderSuffixes = [
    ' 720p',
    ' 720p [Dual Audio]',
    ' 720p NF [Dual Audio]',
    ' 720p AMZN [Dual Audio]',
    ' 720p WEBRip',
    ' 720p WEBRip [Dual Audio]',
    ' 1080p',
    ' 1080p [Dual Audio]',
    ' 1080p NF [Dual Audio]',
    ' 1080p AMZN [Dual Audio]',
    ' 1080p BluRay',
    ''
  ];

  // File suffix variants seen on server
  var fileSuffixes = [
    ' 720p NF-WEB x264.mkv',
    ' 720p WEBRip x264.mkv',
    ' 720p BluRay x264.mkv',
    ' 720p WEBRip.mkv',
    ' 720p.mkv',
    ' 1080p NF-WEB x264.mkv',
    ' 1080p BluRay x264.mkv',
    ' 1080p WEBRip x264.mkv',
    ' 1080p.mkv'
  ];

  var streams = [];
  var seen    = {};

  folderSuffixes.forEach(function(fs) {
    fileSuffixes.forEach(function(vs) {
      var folder  = enc(t + fs) + '/';
      var file    = enc(t + vs);
      var url     = base + folder + file;
      if (!seen[url]) {
        seen[url] = true;
        var q = /1080p/i.test(vs) ? '1080p' : '720p';
        streams.push({
          name:    'DhakaFlix ' + q,
          title:   t,
          url:     url,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        });
      }
    });
  });

  return streams;
}

// ── TV URL builder ────────────────────────────────────────────────────────────
// Real observed structure:
//   /TV Series ♥ A—L/3 Body Problem (TV Series 2024– ) 1080p [Dual Audio]/Season 1/ShowName.S01E01.mkv
//
// Show folder suffix variants — we try common ones.
// Episode file uses dot-separated title + SxxExx pattern.

function getTvStreams(title, year, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var ep   = 'S' + padS + 'E' + padE;

  // Pick range bucket
  var c = title.trim().charAt(0).toUpperCase();
  var rng = TV_RANGES[1];
  for (var i = 0; i < TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { rng = TV_RANGES[i]; break; }
  }
  var rangeBase = TV_BASE + rng.path;

  // Show folder suffix variants
  var showSuffixes = [
    ' (TV Series ' + year + '\u2013 ) 1080p [Dual Audio]',
    ' (TV Series ' + year + '\u2013 ) 720p [Dual Audio]',
    ' (TV Series ' + year + '\u2013 ) 1080p',
    ' (TV Series ' + year + '\u2013 ) 720p',
    ' (TV Series ' + year + '-) 1080p [Dual Audio]',
    ' (TV Series ' + year + '-) 720p [Dual Audio]',
    ' (TV Mini Series ' + year + '\u2013 ) 1080p [Dual Audio]',
    ' (TV Mini Series ' + year + '\u2013 ) 720p [Dual Audio]',
    ' (TV Series ' + year + ')',
    ''
  ];

  // Episode file name variants (dot-title format)
  var dotTitle = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
  var fileVariants = [
    dotTitle + '.' + ep + '.1080p.mkv',
    dotTitle + '.' + ep + '.720p.mkv',
    dotTitle + '.' + ep + '.mkv',
    dotTitle + '.' + ep + '.1080p.WEBRip.x264.mkv',
    dotTitle + '.' + ep + '.720p.WEBRip.x264.mkv',
    dotTitle + '.' + ep + '.1080p.BluRay.x264.mkv',
    dotTitle + '.' + ep + '.720p.BluRay.x264.mkv'
  ];

  var streams = [];
  var seen    = {};

  showSuffixes.forEach(function(sf) {
    var showFolder   = enc(title + sf) + '/';
    var seasonFolder = enc('Season ' + season) + '/';

    fileVariants.forEach(function(fv) {
      var url = rangeBase + showFolder + seasonFolder + enc(fv);
      if (!seen[url]) {
        seen[url] = true;
        var q = /1080p/i.test(fv) ? '1080p' : '720p';
        streams.push({
          name:    'DhakaFlix TV ' + q,
          title:   title + ' ' + ep,
          url:     url,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        });
      }
    });
  });

  return streams;
}

// ── Entry point ───────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type             : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov?'movie':'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title||d.original_title) : (d.name||d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date)||'').substring(0, 4);
      if (!title || !year) return [];
      return isMov
        ? getMovieStreams(title, year)
        : getTvStreams(title, year, season, episode);
    })
    .catch(function(e) {
      console.error('[DhakaFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

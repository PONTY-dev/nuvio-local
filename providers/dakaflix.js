// providers/dakaflix.js
var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA         = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';
var TV_BASE    = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function e(s) { return encodeURIComponent(s); }

// ── Movie URL builder ─────────────────────────────────────────────────────────
// Confirmed real patterns from server:
//
// NEW (2015+) spaces format:
//   Folder: "Title (Year) 720p NF [Dual Audio]"
//   File:   "Title (Year) 720p NF-WEB x264.mkv"
//
// OLD (pre-2015) dots format:
//   Folder: "Title (Year) 720p"
//   File:   "Title.Year.720p.BluRay.x264.mkv"

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? e('(1960-1994)') : e('(' + year + ')');
  var base = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')'; // e.g. "A Journey (2024)"
  var dt   = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.'); // dot format

  // Each entry: [folderName, fileName, label]
  var combos = [
    // ── 720p sources (new space format) ──────────────────────────────────
    [t + ' 720p NF [Dual Audio]',   t + ' 720p NF-WEB x264.mkv',   'DhakaFlix 720p NF'  ],
    [t + ' 720p AMZN [Dual Audio]', t + ' 720p AMZN-WEB x264.mkv', 'DhakaFlix 720p AMZN'],
    [t + ' 720p AMZ [Dual Audio]',  t + ' 720p AMZ-WEB x264.mkv',  'DhakaFlix 720p AMZ' ],
    [t + ' 720p [Dual Audio]',      t + ' 720p WEB-DL x264.mkv',   'DhakaFlix 720p WEB' ],
    [t + ' 720p WEBRip',            t + ' 720p WEBRip x264.mkv',   'DhakaFlix 720p WEBRip'],
    [t + ' 720p WEBRip [Dual Audio]', t + ' 720p WEBRip x264.mkv', 'DhakaFlix 720p WEBRip DA'],
    // ── 1080p sources (new space format) ─────────────────────────────────
    [t + ' 1080p NF [Dual Audio]',   t + ' 1080p NF-WEB x264.mkv',   'DhakaFlix 1080p NF'  ],
    [t + ' 1080p AMZN [Dual Audio]', t + ' 1080p AMZN-WEB x264.mkv', 'DhakaFlix 1080p AMZN'],
    [t + ' 1080p AMZ [Dual Audio]',  t + ' 1080p AMZ-WEB x264.mkv',  'DhakaFlix 1080p AMZ' ],
    [t + ' 1080p [Dual Audio]',      t + ' 1080p WEB-DL x264.mkv',   'DhakaFlix 1080p WEB' ],
    [t + ' 1080p WEBRip',            t + ' 1080p WEBRip x264.mkv',   'DhakaFlix 1080p WEBRip'],
    // ── old dot format ────────────────────────────────────────────────────
    [t + ' 720p',  dt + '.' + year + '.720p.BluRay.x264.mkv',  'DhakaFlix 720p BluRay'],
    [t + ' 720p',  dt + '.' + year + '.720p.WEBRip.x264.mkv',  'DhakaFlix 720p WEBRip'],
    [t + ' 1080p', dt + '.' + year + '.1080p.BluRay.x264.mkv', 'DhakaFlix 1080p BluRay'],
  ];

  return combos.map(function(c) {
    return {
      name:    c[2],
      title:   t,
      url:     base + e(c[0]) + '/' + e(c[1]),
      quality: 'BDIX',
      headers: { 'User-Agent': UA }
    };
  });
}

// ── TV URL builder ────────────────────────────────────────────────────────────
// Confirmed real patterns from server:
//   Folder: "Show Name (TV Series 2024– ) 1080p [Dual Audio]"
//   Season: "Season 1"
//   File:   "ShowName.S01E01.1080p.mkv" (dot format)

function getTvStreams(title, year, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var ep   = 'S'+padS+'E'+padE;
  var dt   = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');

  var c = title.trim().charAt(0).toUpperCase();
  var rng = TV_RANGES[1];
  for (var i=0; i<TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { rng = TV_RANGES[i]; break; }
  }
  var rangeBase = TV_BASE + rng.path;

  // Show folder suffix variants
  var yr = year + '\u2013'; // year + en-dash (e.g. "2024–")
  var showSuffixes = [
    ' (TV Series ' + yr + ' ) 1080p [Dual Audio]',
    ' (TV Series ' + yr + ' ) 720p [Dual Audio]',
    ' (TV Series ' + yr + ' ) 1080p',
    ' (TV Series ' + yr + ' ) 720p',
    ' (TV Series ' + year + '-) 1080p [Dual Audio]',
    ' (TV Series ' + year + '-) 720p [Dual Audio]',
    ' (TV Mini Series ' + yr + ' ) 1080p [Dual Audio]',
    ' (TV Mini Series ' + yr + ' ) 720p [Dual Audio]',
    ' (TV Series ' + year + ')',
    ''
  ];

  // Episode file variants
  var fileVariants = [
    dt + '.' + ep + '.1080p.mkv',
    dt + '.' + ep + '.720p.mkv',
    dt + '.' + ep + '.mkv',
    dt + '.' + ep + '.1080p.WEBRip.x264.mkv',
    dt + '.' + ep + '.720p.WEBRip.x264.mkv',
    dt + '.' + ep + '.1080p.BluRay.x264.mkv',
    dt + '.' + ep + '.720p.BluRay.x264.mkv',
    dt + '.' + ep + '.1080p.NF.WEB-DL.x264.mkv',
    dt + '.' + ep + '.720p.NF.WEB-DL.x264.mkv'
  ];

  var streams = [], seen = {};
  showSuffixes.forEach(function(sf) {
    var showFolder   = e(title + sf) + '/';
    var seasonFolder = e('Season ' + season) + '/';
    fileVariants.forEach(function(fv) {
      var url = rangeBase + showFolder + seasonFolder + e(fv);
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

  return fetch('https://api.themoviedb.org/3/'+(isMov?'movie':'tv')+'/'+tmdbId+'?api_key='+TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title||d.original_title) : (d.name||d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date)||'').substring(0,4);
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

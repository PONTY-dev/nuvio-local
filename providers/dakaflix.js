// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';
var TV_BASE    = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

function ep(s) {
  return encodeURIComponent(s).replace(/%2B/gi, '+');
}

function movieStreams(title, year) {
  var t  = title + ' (' + year + ')';
  var dt = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
  var yf = parseInt(year, 10) <= 1994 ? ep('(1960-1994)') : ep('(' + year + ')');
  var b  = MOVIE_BASE + yf + '/';

  var list = [
    [t + ' 720p NF [Dual Audio]',    t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',           'DhakaFlix 720p NF'   ],
    [t + ' 720p AMZN [Dual Audio]',  t + ' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',   'DhakaFlix 720p AMZN' ],
    [t + ' 720p AMZN [Dual Audio]',  t + ' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',         'DhakaFlix 720p AMZN2'],
    [t + ' 720p AMZ [Dual Audio]',   t + ' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',   'DhakaFlix 720p AMZ'  ],
    [t + ' 720p WEBRip',             dt + '.' + year + '.720p.WEBRip.800MB.x264-GalaxyRG.mkv',                               'DhakaFlix 720p WEBRip'],
    [t + ' 720p [Dual Audio]',       t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',           'DhakaFlix 720p DA'   ],
    [t + ' 720p',                    dt + '.' + year + '.720p.BluRay.x264.ESub-Pahe.mkv',                                    'DhakaFlix 720p'      ],
    [t + ' 1080p NF [Dual Audio]',   t + ' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',          'DhakaFlix 1080p NF'  ],
    [t + ' 1080p AMZN [Dual Audio]', t + ' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',  'DhakaFlix 1080p AMZN'],
    [t + ' 1080p',                   dt + '.' + year + '.1080p.BluRay.x264.mkv',                                             'DhakaFlix 1080p'     ]
  ];

  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push({
      name:    list[i][2],
      title:   t,
      url:     b + ep(list[i][0]) + '/' + ep(list[i][1]),
      quality: 'BDIX',
      headers: { 'User-Agent': UA }
    });
  }
  return out;
}

function tvStreams(title, year, season, episode) {
  var padS = season  < 10 ? '0' + season  : '' + season;
  var padE = episode < 10 ? '0' + episode : '' + episode;
  var epStr = 'S' + padS + 'E' + padE;
  var dt   = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
  var c    = title.trim().charAt(0).toUpperCase();

  var rangePath;
  if (c >= '0' && c <= '9') rangePath = 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/';
  else if (c >= 'A' && c <= 'L') rangePath = 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/';
  else if (c >= 'M' && c <= 'R') rangePath = 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/';
  else rangePath = 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/';

  var base = TV_BASE + rangePath;
  var yr   = year + '\u2013';

  var showSuffixes = [
    ' (TV Series ' + yr + ' ) 1080p [Dual Audio]',
    ' (TV Series ' + yr + ' ) 720p [Dual Audio]',
    ' (TV Series ' + yr + ' ) 1080p',
    ' (TV Mini Series ' + yr + ' ) 1080p [Dual Audio]',
    ' (TV Series ' + year + ')'
  ];

  var fileNames = [
    dt + '.' + epStr + '.1080p.mkv',
    dt + '.' + epStr + '.720p.mkv',
    dt + '.' + epStr + '.mkv',
    dt + '.' + epStr + '.1080p.WEBRip.x264.mkv',
    dt + '.' + epStr + '.720p.WEBRip.x264.mkv'
  ];

  var out = [], seen = {};
  for (var i = 0; i < showSuffixes.length; i++) {
    for (var j = 0; j < fileNames.length; j++) {
      var url = base + ep(title + showSuffixes[i]) + '/' + ep('Season ' + season) + '/' + ep(fileNames[j]);
      if (!seen[url]) {
        seen[url] = 1;
        out.push({ name: 'DhakaFlix TV', title: title + ' ' + epStr, url: url, quality: 'BDIX', headers: { 'User-Agent': UA } });
      }
    }
  }
  return out;
}

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type             : 'movie';
  var season  = media && media.season  ? parseInt(media.season, 10)  : 1;
  var episode = media && media.episode ? parseInt(media.episode, 10) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title || d.original_title) : (d.name || d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];
      if (isMov) return movieStreams(title, year);
      return tvStreams(title, year, season, episode);
    })
    .catch(function(e) {
      console.error('[DFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
// Uses h5ai JSON API (same method as CloudStream BdixDhakaFlix provider)
// h5ai API: POST /_h5ai/public/index.php with JSON body

var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA         = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var MOVIE_HOST = 'http://172.16.50.7';
var MOVIE_PATH = '/DHAKA-FLIX-7/English%20Movies/';
var TV_HOST    = 'http://172.16.50.12';
var TV_PATH    = '/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function ep(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }
function dec(s) { try { return decodeURIComponent(s.replace(/\+/g,' ')); } catch(x) { return s; } }
function norm(s) { return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim(); }

function titleScore(name, target) {
  var clean = name
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*\(\d{4}[^)]*\).*/, '')
    .replace(/\s*(uncut|1080p|720p|480p|4k|nf|amzn|amz|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ');
  var good = [], hits = 0, i;
  for (i = 0; i < words.length; i++) { if (words[i].length > 1) good.push(words[i]); }
  if (!good.length) return 0;
  for (i = 0; i < good.length; i++) { if (a.indexOf(good[i]) !== -1) hits++; }
  return hits / good.length;
}

// ── h5ai API ─────────────────────────────────────────────────────────────────
// h5ai stores files at /_h5ai/public/index.php
// POST with JSON: {"action":"get","items":{"hrefs":["/path/"],"what":1}}
// Returns JSON: {"items":[{"href":"/path/file.mkv","name":"file.mkv",...},...]}

function h5aiList(host, decodedPath) {
  // Encode the path properly for h5ai (spaces as %20)
  var encodedPath = decodedPath.split('/').map(function(seg) {
    return seg ? ep(seg) : seg;
  }).join('/');

  var apiUrl  = host + '/_h5ai/public/index.php';
  var body    = JSON.stringify({ action: 'get', items: { hrefs: [encodedPath], what: 1 } });

  return fetch(apiUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body:    body
  })
  .then(function(r) { return r.json(); })
  .then(function(json) {
    // json.items is an array of {href, name, ...}
    var items = json && json.items ? json.items : [];
    var out   = [], i;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      if (item && item.href && item.href !== encodedPath) {
        out.push({ href: item.href, name: item.name || dec(item.href).split('/').pop() });
      }
    }
    console.error('[DFlix h5ai] path=' + decodedPath + ' items=' + out.length);
    return out;
  })
  .catch(function(e) {
    console.error('[DFlix h5ai] failed: ' + e.message);
    return [];
  });
}

// ── Fallback: parse hrefs from raw HTML ───────────────────────────────────────

function htmlList(host, url) {
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var out = [], seen = {}, m;
      var re  = /href=["']([^"'#]+)["']/gi;
      while ((m = re.exec(html)) !== null) {
        var h = m[1].split('?')[0];
        if (h === '../' || h === './' || h.indexOf('://') !== -1) continue;
        if (h.charAt(0) === '/') h = host + h;
        if (!seen[h]) {
          seen[h] = 1;
          var name = dec(h).replace(/\/$/, '').split('/').pop();
          out.push({ href: h, name: name });
        }
      }
      console.error('[DFlix html] url=' + url + ' items=' + out.length);
      return out;
    })
    .catch(function() { return []; });
}

// List a directory — try h5ai API first, fall back to HTML parsing
function listDir(host, decodedPath) {
  return h5aiList(host, decodedPath)
    .then(function(items) {
      if (items.length > 0) return items;
      // h5ai failed — try plain HTML
      var url = host + decodedPath.split('/').map(function(s){ return s ? ep(s) : s; }).join('/');
      return htmlList(host, url);
    });
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var t   = title + ' (' + year + ')';
  var dt  = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
  var yf  = parseInt(year, 10) <= 1994 ? '(1960-1994)' : '(' + year + ')';
  var yDec = dec(MOVIE_PATH) + yf + '/'; // decoded year folder path

  return listDir(MOVIE_HOST, yDec)
    .then(function(items) {
      // Find best folder match
      var best = null, top = 0, i;
      for (i = 0; i < items.length; i++) {
        var s = titleScore(items[i].name, title);
        if (s > top) { top = s; best = items[i]; }
      }

      if (!best || top < 0.5) {
        console.error('[DFlix] no folder for: ' + title + ' score=' + top);
        return patternStreams(t, dt, year, yDec, null, null);
      }

      var folderName = best.name;
      var folderPath = dec(best.href.replace(/\/$/, '')) + '/';
      console.error('[DFlix] folder=' + folderName);

      return listDir(MOVIE_HOST, folderPath)
        .then(function(fileItems) {
          var videos = [], j;
          for (j = 0; j < fileItems.length; j++) {
            if (/\.(mkv|mp4|avi)$/i.test(fileItems[j].name)) {
              videos.push(fileItems[j]);
            }
          }
          console.error('[DFlix] videos=' + videos.length);

          if (videos.length > 0) {
            var out = [], k;
            for (k = 0; k < videos.length; k++) {
              var fname = videos[k].name;
              var fpath = dec(videos[k].href);
              var furl  = MOVIE_HOST + fpath.split('/').map(function(s){ return s ? ep(s) : s; }).join('/');
              var q     = /1080p/i.test(fname) ? '1080p' : '720p';
              out.push({ name:'DhakaFlix '+q, title:t, url:furl, quality:'BDIX', headers:{'User-Agent':UA} });
            }
            return out;
          }

          // No files from API — use pattern guess from real folder name
          return patternStreams(t, dt, year, yDec, folderName, folderPath);
        });
    })
    .catch(function(err) {
      console.error('[DFlix Movie] ' + err.message);
      return patternStreams(t, dt, year, yDec, null, null);
    });
}

function patternStreams(t, dt, year, yDec, folderName, folderPath) {
  var fn     = folderName || '';
  var isNF   = /\bNF\b/.test(fn);
  var isAMZN = /\bAMZN\b|\bAMZ\b/.test(fn);
  var isWEB  = /WEBRip/i.test(fn);
  var isDual = /\[Dual Audio\]/i.test(fn);
  var q      = /1080p/.test(fn) ? '1080p' : '720p';

  var pairs, i;
  if (isNF && isDual) {
    pairs = [
      [fn, t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'],
      [fn, t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -mkvC.mkv'],
      [fn, t+' '+q+' NF-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv']
    ];
  } else if (isAMZN && isDual) {
    pairs = [
      [fn, t+' UNCUT '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'],
      [fn, t+' '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'],
      [fn, t+' UNCUT '+q+' AMZN-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv']
    ];
  } else if (isWEB) {
    pairs = [
      [fn, dt+'.'+year+'.'+q+'.WEBRip.800MB.x264-GalaxyRG.mkv'],
      [fn, dt+'.'+year+'.'+q+'.WEBRip.x264-GalaxyRG.mkv'],
      [fn, dt+'.'+year+'.'+q+'.WEBRip.x264.mkv']
    ];
  } else if (isDual) {
    pairs = [
      [fn, t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'],
      [fn, t+' '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'],
      [fn, t+' UNCUT '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'],
      [fn, t+' '+q+' WEB-DL x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv']
    ];
  } else {
    // No folder info — try all patterns
    pairs = [
      [t+' 720p NF [Dual Audio]',    t+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'         ],
      [t+' 720p AMZN [Dual Audio]',  t+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv' ],
      [t+' 720p AMZN [Dual Audio]',  t+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'       ],
      [t+' 720p AMZ [Dual Audio]',   t+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv' ],
      [t+' 720p WEBRip',             dt+'.'+year+'.720p.WEBRip.800MB.x264-GalaxyRG.mkv'                                 ],
      [t+' 720p [Dual Audio]',       t+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'         ],
      [t+' 720p',                    dt+'.'+year+'.720p.BluRay.x264.ESub-Pahe.mkv'                                       ],
      [t+' 1080p NF [Dual Audio]',   t+' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'        ],
      [t+' 1080p AMZN [Dual Audio]', t+' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv']
    ];
  }

  var out = [], seen = {};
  var yUrl = MOVIE_HOST + dec(MOVIE_PATH).split('/').map(function(s){ return s ? ep(s) : s; }).join('/') + ep(yf) + '/';
  for (i = 0; i < pairs.length; i++) {
    var fUrl = folderPath
      ? MOVIE_HOST + folderPath.split('/').map(function(s){ return s ? ep(s) : s; }).join('/')
      : yUrl + ep(pairs[i][0]) + '/';
    var url = fUrl + ep(pairs[i][1]);
    if (!seen[url]) {
      seen[url] = 1;
      var ql = /1080p/i.test(pairs[i][1]) ? '1080p' : '720p';
      out.push({ name:'DhakaFlix '+ql, title:t, url:url, quality:'BDIX', headers:{'User-Agent':UA} });
    }
  }
  return out;
}

var yf = ''; // declared here to avoid closure issues in patternStreams

// ── TV ────────────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS    = season  < 10 ? '0'+season  : ''+season;
  var padE    = episode < 10 ? '0'+episode : ''+episode;
  var epLabel = 'S'+padS+'E'+padE;
  var epRe    = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)', 'i');
  var c       = title.trim().charAt(0).toUpperCase();

  var rangePath = TV_RANGES[3].path, i;
  for (i = 0; i < TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { rangePath = TV_RANGES[i].path; break; }
  }

  var tvDecPath = dec(TV_PATH) + dec(rangePath);

  return listDir(TV_HOST, tvDecPath)
    .then(function(items) {
      var best = null, top = 0;
      for (i = 0; i < items.length; i++) {
        var s = titleScore(items[i].name, title);
        if (s > top) { top = s; best = items[i]; }
      }
      if (!best || top < 0.5) throw new Error('show not found: ' + title);
      var showPath = dec(best.href.replace(/\/$/, '')) + '/';
      return listDir(TV_HOST, showPath);
    })
    .then(function(items) {
      var pat = new RegExp('Season\\s*0*' + season + '$', 'i');
      var sf  = null;
      for (i = 0; i < items.length; i++) {
        if (pat.test(items[i].name.trim())) { sf = items[i]; break; }
      }
      if (!sf) throw new Error('season ' + season + ' not found');
      var seasonPath = dec(sf.href.replace(/\/$/, '')) + '/';
      return listDir(TV_HOST, seasonPath);
    })
    .then(function(items) {
      var epItem = null;
      for (i = 0; i < items.length; i++) {
        if (/\.(mkv|mp4|avi|m3u8)$/i.test(items[i].name) && epRe.test(items[i].name)) {
          epItem = items[i]; break;
        }
      }
      if (!epItem) throw new Error(epLabel + ' not found');
      var fpath = dec(epItem.href);
      var furl  = TV_HOST + fpath.split('/').map(function(s){ return s ? ep(s) : s; }).join('/');
      return [{ name:'DhakaFlix TV', title:title+' '+epLabel, url:furl, quality:'BDIX', headers:{'User-Agent':UA} }];
    })
    .catch(function(err) {
      console.error('[DFlix TV] ' + err.message);
      return [];
    });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type                  : 'movie';
  var season  = media && media.season  ? parseInt(media.season,  10) : 1;
  var episode = media && media.episode ? parseInt(media.episode, 10) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title || d.original_title) : (d.name || d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];
      return isMov ? getMovieStreams(title, year) : getTvStreams(title, season, episode);
    })
    .catch(function(err) {
      console.error('[DFlix] ' + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA_MOB     = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var MOVIE_HOST = 'http://172.16.50.7';
var MOVIE_BASE = MOVIE_HOST + '/DHAKA-FLIX-7/English%20Movies/';
var TV_HOST    = 'http://172.16.50.12';
var TV_BASE    = TV_HOST + '/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function ep(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }

function dec(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); }
  catch(x) { return s; }
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function titleScore(name, target) {
  var clean = name
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i, '')
    .replace(/\s*\(\d{4}[^)]*\).*/, '')
    .replace(/\s*(uncut|1080p|720p|480p|4k|nf|amzn|amz|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i, '')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ');
  var good = [], i;
  for (i = 0; i < words.length; i++) { if (words[i].length > 1) good.push(words[i]); }
  if (!good.length) return 0;
  var hits = 0;
  for (i = 0; i < good.length; i++) { if (a.indexOf(good[i]) !== -1) hits++; }
  return hits / good.length;
}

// Extract hrefs AND raw filenames from HTML
function getLinks(html, host) {
  var hrefs = [], seen = {}, m;

  // Method 1: href attributes
  var re1 = /href=["']([^"'#]+)["']/gi;
  while ((m = re1.exec(html)) !== null) {
    var h = m[1].split('?')[0]; // strip query params
    if (h === '../' || h === './' || h.indexOf('://') !== -1) continue;
    if (h.charAt(0) === '/') h = host + h;
    if (!seen[h]) { seen[h] = 1; hrefs.push(h); }
  }

  // Method 2: any quoted string that looks like a filename (.mkv/.mp4/.avi)
  var re2 = /["']([^"'\r\n<>]+\.(?:mkv|mp4|avi))["']/gi;
  while ((m = re2.exec(html)) !== null) {
    var f = m[1];
    // Skip if it's already a full URL
    if (f.indexOf('://') !== -1) continue;
    // Skip if it's a path (has slashes) — keep only bare filenames
    var bare = f.indexOf('/') === -1 ? f : f.split('/').pop();
    if (bare.length > 5 && !seen[bare]) { seen[bare] = 1; hrefs.push(bare); }
  }

  return hrefs;
}

function fetchText(url) {
  return fetch(url, { headers: { 'User-Agent': UA_MOB } })
    .then(function(r) { return r.text(); });
}

// Find best matching folder from a list of hrefs
function bestFolder(hrefs, title, host) {
  var best = null, top = 0, i;
  for (i = 0; i < hrefs.length; i++) {
    var h = hrefs[i];
    var name = dec(h).replace(/\/$/, '').split('/').pop();
    var s = titleScore(name, title);
    if (s > top) { top = s; best = h; }
  }
  return (best && top >= 0.5) ? best : null;
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year, 10) <= 1994 ? ep('(1960-1994)') : ep('(' + year + ')');
  var yUrl = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';
  var dt   = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');

  return fetchText(yUrl)
    .then(function(html) {
      var hrefs = getLinks(html, MOVIE_HOST);
      var best  = bestFolder(hrefs, title, MOVIE_HOST);

      if (!best) {
        console.error('[DFlix] no folder for: ' + title);
        return fallbackStreams(t, dt, year, yUrl);
      }

      var folderUrl = (best.indexOf('://') !== -1)
        ? (best.slice(-1) === '/' ? best : best + '/')
        : yUrl + ep(dec(best).replace(/\/$/, '')) + '/';

      console.error('[DFlix] folder=' + dec(best));

      return fetchText(folderUrl)
        .then(function(html2) {
          var links = getLinks(html2, MOVIE_HOST);
          var videos = [], i;

          for (i = 0; i < links.length; i++) {
            var link = links[i];
            var name = link.indexOf('://') !== -1
              ? dec(link).split('/').pop()
              : link; // bare filename from Method 2
            if (/\.(mkv|mp4|avi)$/i.test(name)) {
              videos.push(link);
            }
          }

          console.error('[DFlix] videos=' + videos.length + (videos[0] ? ' first=' + dec(videos[0]).split('/').pop() : ''));

          if (videos.length > 0) {
            var out = [], i2;
            for (i2 = 0; i2 < videos.length; i2++) {
              var v = videos[i2];
              var fname, fileUrl;
              if (v.indexOf('://') !== -1) {
                // Full URL
                fname   = dec(v).split('/').pop();
                fileUrl = v;
              } else {
                // Bare filename
                fname   = v;
                fileUrl = folderUrl + ep(v);
              }
              var q = /1080p/i.test(fname) ? '1080p' : '720p';
              out.push({ name:'DhakaFlix '+q, title:t, url:fileUrl, quality:'BDIX', headers:{'User-Agent':UA_MOB} });
            }
            return out;
          }

          // No files found — use pattern fallback with known folder name
          var folderName = dec(best).replace(/\/$/, '').split('/').pop();
          return fallbackStreams(t, dt, year, yUrl, folderName, folderUrl);
        });
    })
    .catch(function(err) {
      console.error('[DFlix Movie] ' + err.message);
      return fallbackStreams(t, dt, year, yUrl);
    });
}

function fallbackStreams(t, dt, year, yUrl, folderName, folderUrl) {
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
  } else {
    // No folder info — try all known patterns
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
  for (i = 0; i < pairs.length; i++) {
    var fUrl = folderUrl ? folderUrl : yUrl + ep(pairs[i][0]) + '/';
    var url  = fUrl + ep(pairs[i][1]);
    if (!seen[url]) {
      seen[url] = 1;
      var ql = /1080p/i.test(pairs[i][1]) ? '1080p' : '720p';
      out.push({ name:'DhakaFlix '+ql, title:t, url:url, quality:'BDIX', headers:{'User-Agent':UA_MOB} });
    }
  }
  return out;
}

// ── TV ────────────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS    = season  < 10 ? '0'+season  : ''+season;
  var padE    = episode < 10 ? '0'+episode : ''+episode;
  var epLabel = 'S'+padS+'E'+padE;
  var epRe    = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)', 'i');
  var c       = title.trim().charAt(0).toUpperCase();

  var rangePath = TV_RANGES[3].path;
  var i;
  for (i = 0; i < TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { rangePath = TV_RANGES[i].path; break; }
  }

  return fetchText(TV_BASE + rangePath)
    .then(function(html) {
      var hrefs = getLinks(html, TV_HOST);
      var best  = bestFolder(hrefs, title, TV_HOST);
      if (!best) throw new Error('show not found: ' + title);
      var showUrl = best.slice(-1) === '/' ? best : best + '/';
      return fetchText(showUrl);
    })
    .then(function(html) {
      var hrefs = getLinks(html, TV_HOST);
      var pat   = new RegExp('Season\\s*0*' + season + '$', 'i');
      var sf    = null;
      for (i = 0; i < hrefs.length; i++) {
        var name = dec(hrefs[i]).replace(/\/$/, '').split('/').pop().trim();
        if (pat.test(name)) { sf = hrefs[i]; break; }
      }
      if (!sf) throw new Error('season ' + season + ' not found');
      var seasonUrl = sf.slice(-1) === '/' ? sf : sf + '/';
      return fetchText(seasonUrl);
    })
    .then(function(html) {
      var hrefs  = getLinks(html, TV_HOST);
      var epFile = null;
      for (i = 0; i < hrefs.length; i++) {
        var n = dec(hrefs[i]).split('/').pop();
        if (/\.(mkv|mp4|avi|m3u8)$/i.test(n) && epRe.test(n)) { epFile = hrefs[i]; break; }
      }
      if (!epFile) throw new Error(epLabel + ' not found');
      var fileUrl = epFile.indexOf('://') !== -1 ? epFile : TV_HOST + epFile;
      return [{ name:'DhakaFlix TV', title:title+' '+epLabel, url:fileUrl, quality:'BDIX', headers:{'User-Agent':UA_MOB} }];
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
      if (isMov) return getMovieStreams(title, year);
      return getTvStreams(title, season, episode);
    })
    .catch(function(err) {
      console.error('[DFlix] ' + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

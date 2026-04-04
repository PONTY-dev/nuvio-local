// providers/dakaflix.js
var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';
var MOVIE_HOST = 'http://172.16.50.7';
var MOVIE_BASE = MOVIE_HOST + '/DHAKA-FLIX-7/English%20Movies/';
var TV_HOST    = 'http://172.16.50.12';
var TV_BASE    = TV_HOST + '/DHAKA-FLIX-12/TV-WEB-Series/';
var UA_MOB     = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Try these user agents to get raw Apache listing instead of custom UI
var CRAWL_UAS = [
  'Wget/1.21.3',
  'curl/7.88.1',
  'python-requests/2.28.0',
  'Go-http-client/1.1',
  'Apache-HttpClient/4.5'
];

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
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(uncut|1080p|720p|480p|4k|nf|amzn|amz|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length > 1; });
  if (!words.length) return 0;
  var hits = 0;
  for (var i = 0; i < words.length; i++) { if (a.indexOf(words[i]) !== -1) hits++; }
  return hits / words.length;
}

// Parse hrefs from Apache-style listing
function parseHrefs(html, host) {
  var out = [], seen = {};
  var re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h==='../'||h==='./'||h.indexOf('://')!==-1) continue;
    if (h.charAt(0)==='/') h = host + h;
    if (!seen[h]) { seen[h]=1; out.push(h); }
  }
  return out;
}

// Try fetching with multiple user agents until we get file links
function crawlDir(url, host) {
  var i = 0;
  function tryNext() {
    if (i >= CRAWL_UAS.length) return Promise.resolve([]);
    var ua = CRAWL_UAS[i++];
    return fetch(url, { headers: { 'User-Agent': ua } })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var hrefs = parseHrefs(html, host);
        // Check if we got real file/folder links (not just nav links)
        var useful = hrefs.filter(function(h) {
          var n = dec(h);
          return n.indexOf('DHAKA') !== -1 || /\.(mkv|mp4|avi)$/i.test(n);
        });
        if (useful.length > 0) {
          console.error('[DFlix] crawl ok ua=' + ua + ' links=' + useful.length);
          return hrefs;
        }
        console.error('[DFlix] crawl empty ua=' + ua + ' trying next');
        return tryNext();
      })
      .catch(function() { return tryNext(); });
  }
  return tryNext();
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year, 10) <= 1994 ? ep('(1960-1994)') : ep('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';
  var dt   = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');

  return crawlDir(yUrl, MOVIE_HOST)
    .then(function(hrefs) {
      // Find best folder
      var bestH = null, bestName = '', top = 0;
      for (var i = 0; i < hrefs.length; i++) {
        var name = dec(hrefs[i]).replace(/\/$/,'').split('/').pop();
        var s    = titleScore(name, title);
        if (s > top) { top=s; bestH=hrefs[i]; bestName=name; }
      }

      if (!bestH || top < 0.5) {
        console.error('[DFlix] no folder for: '+title+' score='+top);
        // Fall back to pattern guessing
        return patternStreams(t, dt, year, yUrl);
      }

      console.error('[DFlix] folder='+bestName);
      var folderUrl = bestH.slice(-1)==='/' ? bestH : bestH+'/';

      return crawlDir(folderUrl, MOVIE_HOST)
        .then(function(fHrefs) {
          var videos = [];
          for (var j = 0; j < fHrefs.length; j++) {
            if (/\.(mkv|mp4|avi)$/i.test(dec(fHrefs[j]))) videos.push(fHrefs[j]);
          }
          console.error('[DFlix] videos='+videos.length);

          if (videos.length > 0) {
            var out = [];
            for (var k = 0; k < videos.length; k++) {
              var fname = dec(videos[k]).split('/').pop();
              var q = /1080p/i.test(fname)?'1080p':'720p';
              out.push({ name:'DhakaFlix '+q, title:t, url:videos[k], quality:'BDIX', headers:{'User-Agent':UA_MOB} });
            }
            return out;
          }
          // Crawl found folder but no video hrefs — pattern guess
          return patternStreams(t, dt, year, yUrl, bestName, folderUrl);
        });
    })
    .catch(function(err) {
      console.error('[DFlix Movie] '+err.message);
      return patternStreams(t, dt, year, yUrl);
    });
}

function patternStreams(t, dt, year, yUrl, folderName, folderUrl) {
  var fn  = folderName || '';
  var isNF   = /\bNF\b/.test(fn);
  var isAMZN = /\bAMZN\b|\bAMZ\b/.test(fn);
  var isWEB  = /WEBRip/i.test(fn);
  var isDual = /\[Dual Audio\]/i.test(fn);
  var q      = /1080p/.test(fn) ? '1080p' : '720p';

  var pairs = [];
  if (isNF && isDual) {
    pairs = [
      [fn, t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'],
      [fn, t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -mkvC.mkv']
    ];
  } else if (isAMZN && isDual) {
    pairs = [
      [fn, t+' UNCUT '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'],
      [fn, t+' '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv']
    ];
  } else if (isWEB) {
    pairs = [
      [fn, dt+'.'+year+'.'+q+'.WEBRip.800MB.x264-GalaxyRG.mkv'],
      [fn, dt+'.'+year+'.'+q+'.WEBRip.x264-GalaxyRG.mkv']
    ];
  } else {
    // No folder info — try all patterns
    pairs = [
      [t+' 720p NF [Dual Audio]',    t+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'          ],
      [t+' 720p AMZN [Dual Audio]',  t+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'  ],
      [t+' 720p AMZN [Dual Audio]',  t+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'        ],
      [t+' 720p AMZ [Dual Audio]',   t+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv'  ],
      [t+' 720p WEBRip',             dt+'.'+year+'.720p.WEBRip.800MB.x264-GalaxyRG.mkv'                                  ],
      [t+' 720p [Dual Audio]',       t+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'          ],
      [t+' 720p',                    dt+'.'+year+'.720p.BluRay.x264.ESub-Pahe.mkv'                                        ],
      [t+' 1080p NF [Dual Audio]',   t+' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'         ],
      [t+' 1080p AMZN [Dual Audio]', t+' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv' ]
    ];
  }

  var out = [], seen = {};
  for (var i = 0; i < pairs.length; i++) {
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

function getTvStreams(title, year, season, episode) {
  var padS    = season  < 10 ? '0'+season  : ''+season;
  var padE    = episode < 10 ? '0'+episode : ''+episode;
  var epLabel = 'S'+padS+'E'+padE;
  var epRe    = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');
  var dt      = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');

  var c = title.trim().charAt(0).toUpperCase();
  var rangePath = 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/';
  if (c>='0'&&c<='9') rangePath='TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/';
  else if (c>='A'&&c<='L') rangePath='TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/';
  else if (c>='M'&&c<='R') rangePath='TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/';

  return crawlDir(TV_BASE + rangePath, TV_HOST)
    .then(function(hrefs) {
      var best = null, top = 0;
      for (var i = 0; i < hrefs.length; i++) {
        var name = dec(hrefs[i]).replace(/\/$/,'').split('/').pop();
        var s = titleScore(name, title);
        if (s > top) { top=s; best=hrefs[i]; }
      }
      if (!best || top < 0.5) throw new Error('show not found: '+title);
      return crawlDir(best.slice(-1)==='/'?best:best+'/', TV_HOST);
    })
    .then(function(hrefs) {
      var pat = new RegExp('Season\\s*0*'+season+'$','i');
      var sf  = null;
      for (var i = 0; i < hrefs.length; i++) {
        if (pat.test(dec(hrefs[i]).replace(/\/$/,'').split('/').pop().trim())) { sf=hrefs[i]; break; }
      }
      if (!sf) throw new Error('season '+season+' not found');
      return crawlDir(sf.slice(-1)==='/'?sf:sf+'/', TV_HOST);
    })
    .then(function(hrefs) {
      var videos = hrefs.filter(function(h){ return /\.(mkv|mp4|avi|m3u8)$/i.test(dec(h)); });
      var epFile = null;
      for (var i = 0; i < videos.length; i++) {
        if (epRe.test(dec(videos[i]))) { epFile=videos[i]; break; }
      }
      if (!epFile) throw new Error(epLabel+' not found');
      return [{ name:'DhakaFlix TV', title:title+' '+epLabel, url:epFile, quality:'BDIX', headers:{'User-Agent':UA_MOB} }];
    })
    .catch(function(err) {
      console.error('[DFlix TV] '+err.message);
      return [];
    });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type                  : 'movie';
  var season  = media && media.season  ? parseInt(media.season,  10) : 1;
  var episode = media && media.episode ? parseInt(media.episode, 10) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/'+(isMov?'movie':'tv')+'/'+tmdbId+'?api_key='+TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title||d.original_title) : (d.name||d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date)||'').substring(0,4);
      if (!title || !year) return [];
      return isMov ? getMovieStreams(title, year) : getTvStreams(title, year, season, episode);
    })
    .catch(function(err) { console.error('[DFlix] '+err.message); return []; });
}

module.exports = { getStreams: getStreams };

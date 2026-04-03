// providers/dakaflix.js
var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA         = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
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

// Encode path segment but keep + as literal + (Apache serves filenames with + literally)
function ep(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }
function dec(s) { try { return decodeURIComponent(s.replace(/\+/g,' ')); } catch(x) { return s; } }

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function titleScore(name, target) {
  var clean = name
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(uncut|1080p|720p|480p|4k|nf|amzn|amz|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length > 1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w) !== -1; }).length / words.length;
}

function parseHrefs(html, host) {
  var out = [], seen = {};
  var re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === './' || h.indexOf('://') !== -1) continue;
    if (h.charAt(0) === '/') h = host + h;
    if (!seen[h]) { seen[h]=1; out.push(h); }
  }
  return out;
}

function get(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r){ return r.text(); });
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? ep('(1960-1994)') : ep('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';
  var dt   = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');

  // Confirmed real file patterns from server (keep + literal)
  var nfFile    = t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv';
  var amznFile  = t + ' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv';
  var amznFile2 = t + ' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv';
  var webFile   = dt + '.' + year + '.720p.WEBRip.800MB.x264-GalaxyRG.mkv';
  var blFile    = dt + '.' + year + '.720p.BluRay.x264.ESub-Pahe.mkv';

  // folder → file mapping (confirmed patterns)
  var combos = [
    [t+' 720p NF [Dual Audio]',    nfFile,    '720p NF'  ],
    [t+' 720p AMZN [Dual Audio]',  amznFile,  '720p AMZN'],
    [t+' 720p AMZN [Dual Audio]',  amznFile2, '720p AMZN'],
    [t+' 720p AMZ [Dual Audio]',   amznFile,  '720p AMZ' ],
    [t+' 720p AMZ [Dual Audio]',   amznFile2, '720p AMZ' ],
    [t+' 720p WEBRip',             webFile,   '720p WEBRip'],
    [t+' 720p WEBRip [Dual Audio]',webFile,   '720p WEBRip'],
    [t+' 720p [Dual Audio]',       nfFile,    '720p'     ],
    [t+' 720p',                    blFile,    '720p BluRay'],
    [t+' 1080p NF [Dual Audio]',   t+' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv', '1080p NF'],
    [t+' 1080p AMZN [Dual Audio]', t+' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv', '1080p AMZN'],
    [t+' 1080p',                   dt+'.'+year+'.1080p.BluRay.x264.mkv', '1080p BluRay']
  ];

  // Try crawl first, fall back to guesses
  return get(yUrl)
    .then(function(html) {
      var hrefs = parseHrefs(html, MOVIE_HOST);
      // Find real folder from crawl
      var bestH = null, bestName = '', top = 0;
      hrefs.forEach(function(h) {
        var segs = dec(h).replace(/\/$/,'').split('/');
        var name = segs[segs.length-1];
        var s    = titleScore(name, title);
        if (s > top) { top=s; bestH=h; bestName=name; }
      });

      if (bestH && top >= 0.5) {
        var folderUrl = bestH.slice(-1)==='/' ? bestH : bestH+'/';
        return get(folderUrl)
          .then(function(html2) {
            var fHrefs = parseHrefs(html2, MOVIE_HOST);
            var videos = fHrefs.filter(function(h){ return /\.(mkv|mp4|avi)$/i.test(dec(h)); });
            if (videos.length) {
              return videos.map(function(h) {
                var fname = dec(h).split('/').pop();
                var q = /1080p/i.test(fname)?'1080p':'720p';
                return { name:'DhakaFlix '+q, title:t, url:h, quality:'BDIX', headers:{'User-Agent':UA} };
              });
            }
            // No file hrefs — use pattern guesser with real folder
            return buildFromFolder(folderUrl, bestName, combos, yUrl, t);
          });
      }
      // No folder found — full guess
      return buildFromFolder(null, '', combos, yUrl, t);
    })
    .catch(function() {
      return buildFromFolder(null, '', combos, yUrl, t);
    });
}

function buildFromFolder(folderUrl, folderName, combos, yUrl, t) {
  var seen = {}, streams = [];
  combos.forEach(function(c) {
    var folder = folderUrl || (yUrl + ep(c[0]) + '/');
    // Only use the matching file for this folder pattern if crawl found it
    // Otherwise use all combos as guesses
    var url = folder + ep(c[1]);
    if (!seen[url]) {
      seen[url] = 1;
      streams.push({ name:'DhakaFlix '+c[2], title:t, url:url, quality:'BDIX', headers:{'User-Agent':UA} });
    }
  });
  return streams;
}

// ── TV ────────────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var ep2  = 'S'+padS+'E'+padE;
  var epRe = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');

  var c = title.trim().charAt(0).toUpperCase();
  var rng = TV_RANGES[1];
  for (var i=0; i<TV_RANGES.length; i++) { if(TV_RANGES[i].test(c)){rng=TV_RANGES[i];break;} }
  var rUrl = TV_BASE + rng.path;

  return get(rUrl)
    .then(function(html) {
      var hrefs = parseHrefs(html, TV_HOST);
      var best = null, top = 0;
      hrefs.forEach(function(h) {
        var name = dec(h).replace(/\/$/,'').split('/').pop();
        var s = titleScore(name, title);
        if (s > top) { top=s; best=h; }
      });
      if (!best || top < 0.5) throw new Error('show not found: '+title);
      return get(best.slice(-1)==='/'?best:best+'/');
    })
    .then(function(html) {
      var hrefs = parseHrefs(html, TV_HOST);
      var pat = new RegExp('Season\\s*0*'+season+'$','i');
      var sf  = hrefs.find(function(h){ return pat.test(dec(h).replace(/\/$/,'').split('/').pop().trim()); });
      if (!sf) throw new Error('season '+season+' not found');
      return get(sf.slice(-1)==='/'?sf:sf+'/');
    })
    .then(function(html) {
      var hrefs  = parseHrefs(html, TV_HOST);
      var videos = hrefs.filter(function(h){ return /\.(mkv|mp4|avi|m3u8)$/i.test(dec(h)); });
      var epFile = videos.find(function(h){ return epRe.test(dec(h)); });
      if (!epFile) throw new Error(ep2+' not found');
      return [{ name:'DhakaFlix TV', title:title+' '+ep2, url:epFile, quality:'BDIX', headers:{'User-Agent':UA} }];
    })
    .catch(function(err) {
      console.error('[DFlix TV] '+err.message);
      return [];
    });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type             : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMov   = type === 'movie';
  return fetch('https://api.themoviedb.org/3/'+(isMov?'movie':'tv')+'/'+tmdbId+'?api_key='+TMDB_KEY)
    .then(function(r){ return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title||d.original_title) : (d.name||d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date)||'').substring(0,4);
      if (!title || !year) return [];
      return isMov ? getMovieStreams(title, year) : getTvStreams(title, season, episode);
    })
    .catch(function(err) { console.error('[DFlix] '+err.message); return []; });
}

module.exports = { getStreams: getStreams };

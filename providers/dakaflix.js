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

// Keep + as literal in paths (Apache serves filenames with + literally)
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

// Parse hrefs including absolute paths
function parseHrefs(html, host) {
  var out = [], seen = {};
  var re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === './') continue;
    if (h.indexOf('://') !== -1) continue;
    if (h.charAt(0) === '/') h = host + h;
    if (!seen[h]) { seen[h]=1; out.push(h); }
  }
  return out;
}

function get(url) {
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) {
      var ct = r.headers && r.headers.get ? r.headers.get('content-type') : '';
      console.error('[DFlix] GET ' + url + ' status=' + r.status + ' ct=' + ct);
      return r.text();
    });
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? ep('(1960-1994)') : ep('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';
  var dt   = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');

  return get(yUrl)
    .then(function(html) {
      console.error('[DFlix] html length=' + html.length + ' sample=' + html.substring(0,200));

      var hrefs = parseHrefs(html, MOVIE_HOST);
      console.error('[DFlix] hrefs count=' + hrefs.length + (hrefs[0]?' first='+hrefs[0]:''));

      // Find best folder match
      var bestH = null, bestName = '', top = 0;
      hrefs.forEach(function(h) {
        var segs = dec(h).replace(/\/$/,'').split('/');
        var name = segs[segs.length-1];
        var s    = titleScore(name, title);
        if (s > top) { top=s; bestH=h; bestName=name; }
      });

      console.error('[DFlix] best folder=' + bestName + ' score=' + top);

      if (bestH && top >= 0.5) {
        var folderUrl = bestH.slice(-1)==='/' ? bestH : bestH+'/';
        return get(folderUrl)
          .then(function(html2) {
            console.error('[DFlix] folder html length=' + html2.length);
            var fHrefs = parseHrefs(html2, MOVIE_HOST);
            console.error('[DFlix] folder hrefs=' + fHrefs.length + (fHrefs[0]?' first='+fHrefs[0]:''));
            var videos = fHrefs.filter(function(h){ return /\.(mkv|mp4|avi)$/i.test(dec(h)); });
            console.error('[DFlix] videos=' + videos.length);

            if (videos.length) {
              return videos.map(function(h) {
                var fname = dec(h).split('/').pop();
                var q = /1080p/i.test(fname)?'1080p':'720p';
                return { name:'DhakaFlix '+q, title:t, url:h, quality:'BDIX', headers:{'User-Agent':UA} };
              });
            }
            // No hrefs found — fall back to pattern guess using real folder name
            return patternGuess(yUrl, bestName, t, dt, year);
          });
      }
      // No folder found — full pattern guess
      return patternGuess(yUrl, '', t, dt, year);
    })
    .catch(function(err) {
      console.error('[DFlix Movie] error=' + err.message);
      return patternGuess(yUrl, '', t, dt, year);
    });
}

function patternGuess(yUrl, folderName, t, dt, year) {
  var fn = folderName;
  var isNF   = /\bNF\b/i.test(fn);
  var isAMZN = /\bAMZN\b|\bAMZ\b/i.test(fn);
  var isWEB  = /WEBRip/i.test(fn) && !isNF && !isAMZN;

  // Build combos: [folder, file, label]
  var combos = [
    [t+' 720p NF [Dual Audio]',    t+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',              '720p NF'   ],
    [t+' 720p AMZN [Dual Audio]',  t+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',      '720p AMZN' ],
    [t+' 720p AMZN [Dual Audio]',  t+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',            '720p AMZN' ],
    [t+' 720p AMZ [Dual Audio]',   t+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',      '720p AMZ'  ],
    [t+' 720p WEBRip',             dt+'.'+year+'.720p.WEBRip.800MB.x264-GalaxyRG.mkv',                                     '720p WEBRip'],
    [t+' 720p WEBRip [Dual Audio]',dt+'.'+year+'.720p.WEBRip.800MB.x264-GalaxyRG.mkv',                                     '720p WEBRip'],
    [t+' 720p',                    dt+'.'+year+'.720p.BluRay.x264.ESub-Pahe.mkv',                                           '720p BluRay'],
    [t+' 1080p NF [Dual Audio]',   t+' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',             '1080p NF'  ],
    [t+' 1080p AMZN [Dual Audio]', t+' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',    '1080p AMZN'],
    [t+' 1080p',                   dt+'.'+year+'.1080p.BluRay.x264.mkv',                                                    '1080p BluRay']
  ];

  // If we have a real folder from crawl, only generate files for that folder
  var seen = {}, streams = [];
  combos.forEach(function(c) {
    if (fn && titleScore(c[0], fn.replace(/ \(\d{4}[^)]*\).*/,'').trim()) < 0.4) return;
    var folder = fn ? (yUrl + ep(fn) + '/') : (yUrl + ep(c[0]) + '/');
    var url    = folder + ep(c[1]);
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
  var epLabel = 'S'+padS+'E'+padE;
  var epRe    = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');

  var c = title.trim().charAt(0).toUpperCase();
  var rng = TV_RANGES[1];
  for (var i=0; i<TV_RANGES.length; i++) { if(TV_RANGES[i].test(c)){rng=TV_RANGES[i];break;} }

  return get(TV_BASE + rng.path)
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
      if (!epFile) throw new Error(epLabel+' not found');
      return [{ name:'DhakaFlix TV', title:title+' '+epLabel, url:epFile, quality:'BDIX', headers:{'User-Agent':UA} }];
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

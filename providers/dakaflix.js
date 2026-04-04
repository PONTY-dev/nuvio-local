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
  return words.filter(function(w){ return a.indexOf(w) !== -1; }).length / words.length;
}

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

function get(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r){ return r.text(); });
}

// ── File patterns from folder name (confirmed from real server) ───────────────

function filesFromFolder(folderName, title, year) {
  var t  = title + ' (' + year + ')';
  var dt = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');
  var fn = folderName;
  var isNF   = /\bNF\b/.test(fn);
  var isAMZN = /\bAMZN\b|\bAMZ\b/.test(fn);
  var isWEB  = /WEBRip/i.test(fn);
  var isDual = /\[Dual Audio\]/i.test(fn);
  var q      = /1080p/.test(fn) ? '1080p' : '720p';

  if (isNF && isDual) return [
    t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',
    t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -mkvC.mkv',
    t+' '+q+' NF-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',
    t+' '+q+' NF-WEB x264 [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'
  ];
  if (isAMZN && isDual) return [
    t+' UNCUT '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',
    t+' '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',
    t+' UNCUT '+q+' AMZN-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',
    t+' '+q+' AMZN-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv'
  ];
  if (isWEB) return [
    dt+'.'+year+'.'+q+'.WEBRip.800MB.x264-GalaxyRG.mkv',
    dt+'.'+year+'.'+q+'.WEBRip.x264-GalaxyRG.mkv',
    dt+'.'+year+'.'+q+'.WEBRip.x264.mkv',
    dt+'.'+year+'.'+q+'.WEBRip.x265-GalaxyRG.mkv'
  ];
  if (isDual) return [
    t+' '+q+' NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',
    t+' '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',
    t+' UNCUT '+q+' AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',
    t+' '+q+' WEB-DL x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv'
  ];
  // Old BluRay / unknown
  return [
    dt+'.'+year+'.'+q+'.BluRay.x264.ESub-Pahe.mkv',
    dt+'.'+year+'.'+q+'.BluRay.x264.mkv',
    dt+'.'+year+'.'+q+'.BluRay.x264-YTS.mkv',
    dt+'.'+year+'.'+q+'.WEBRip.x264.mkv',
    dt+'.'+year+'.'+q+'.mkv'
  ];
}

function buildStreams(folderUrl, folderName, title, year) {
  var t    = title + ' (' + year + ')';
  var src  = /\bNF\b/.test(folderName)       ? 'NF'
           : /\bAMZN\b|\bAMZ\b/.test(folderName) ? 'AMZN'
           : /WEBRip/i.test(folderName)      ? 'WEBRip' : 'BluRay';
  var q    = /1080p/.test(folderName) ? '1080p' : '720p';
  var files = filesFromFolder(folderName, title, year);
  return files.map(function(f, i) {
    return {
      name:    'DhakaFlix ' + q + ' ' + src + (i > 0 ? ' v'+(i+1) : ''),
      title:   t,
      url:     folderUrl + ep(f),
      quality: 'BDIX',
      headers: { 'User-Agent': UA }
    };
  });
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? ep('(1960-1994)') : ep('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';

  return get(yUrl)
    .then(function(html) {
      var hrefs = parseHrefs(html, MOVIE_HOST);
      var bestH = null, bestName = '', top = 0;
      hrefs.forEach(function(h) {
        var name = dec(h).replace(/\/$/,'').split('/').pop();
        var s    = titleScore(name, title);
        if (s > top) { top=s; bestH=h; bestName=name; }
      });

      if (!bestH || top < 0.5) {
        console.error('[DFlix] no folder for: ' + title + ' (hrefs=' + hrefs.length + ')');
        return [];
      }

      var folderUrl = bestH.slice(-1)==='/' ? bestH : bestH+'/';
      console.error('[DFlix] folder=' + bestName);
      return buildStreams(folderUrl, bestName, title, year);
    })
    .catch(function(err) {
      console.error('[DFlix Movie] ' + err.message);
      return [];
    });
}

// ── TV ────────────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS    = season  < 10 ? '0'+season  : ''+season;
  var padE    = episode < 10 ? '0'+episode : ''+episode;
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

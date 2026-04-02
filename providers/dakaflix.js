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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDir(html) {
  var out = [], re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h==='../'||h==='./'||h.indexOf('://')!==-1||h[0]==='?'||h[0]==='/') continue;
    out.push(h);
  }
  return out;
}

function decode(s) {
  try { return decodeURIComponent(s.replace(/\+/g,' ')); }
  catch(e) { return s; }
}

// Key fix: always decode the href then re-encode each path segment.
// This handles both pre-encoded and raw hrefs from the server.
function safeUrl(base, href) {
  var isDir = href.slice(-1) === '/';
  var raw   = decode(href.replace(/\/$/,'')); // get plain text name
  return base + encodeURIComponent(raw) + (isDir ? '/' : '');
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function score(href, target) {
  var clean = decode(href)
    .replace(/\/$/,'')
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(1080p|720p|480p|4k|nf|amzn|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length>1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w)!==-1; }).length / words.length;
}

function get(url) {
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) { return r.text(); });
}

function findBest(entries, target) {
  var best = null, top = 0;
  entries.forEach(function(e) {
    var s = score(e, target);
    if (s > top) { top = s; best = e; }
  });
  return (best && top >= 0.5) ? best : null;
}

// ── Movie crawler ─────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? '%281960-1994%29/' : '%28' + year + '%29/';
  var yUrl = MOVIE_BASE + yf;

  return get(yUrl)
    .then(function(html) {
      var entries = parseDir(html);
      var best    = findBest(entries, title);
      if (!best) throw new Error('no folder for: ' + title);

      var movieUrl = safeUrl(yUrl, best); // correctly encoded folder URL
      return get(movieUrl)
        .then(function(html2) {
          var files = parseDir(html2).filter(function(f) {
            return /\.(mkv|mp4|avi)$/i.test(decode(f));
          });
          if (!files.length) throw new Error('no video files in: ' + decode(best));
          return files.map(function(f) {
            var q = /1080p/i.test(f) ? '1080p' : /720p/i.test(f) ? '720p' : 'SD';
            return {
              name:    'DhakaFlix ' + q,
              title:   title + ' (' + year + ')',
              url:     safeUrl(movieUrl, f), // correctly encoded file URL
              quality: 'BDIX',
              headers: { 'User-Agent': UA }
            };
          });
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix Movie] ' + e.message);
      return [];
    });
}

// ── TV crawler ────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var ep   = 'S'+padS+'E'+padE;
  var epRe = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');

  var c = title.trim().charAt(0).toUpperCase();
  var rng = TV_RANGES[1];
  for (var i=0; i<TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { rng = TV_RANGES[i]; break; }
  }
  var rUrl = TV_BASE + rng.path;

  return get(rUrl)
    .then(function(html) {
      var entries = parseDir(html);
      var best    = findBest(entries, title);
      if (!best) throw new Error('show not found: ' + title);

      var showUrl = safeUrl(rUrl, best);
      return get(showUrl)
        .then(function(html2) {
          var entries2 = parseDir(html2);
          var pat = new RegExp('^Season\\s*0*'+season+'\\s*$','i');
          var sf  = entries2.find(function(e) {
            return pat.test(decode(e).replace(/\/$/,'').trim());
          });
          if (!sf) throw new Error('season '+season+' not found');

          var seasonUrl = safeUrl(showUrl, sf);
          return get(seasonUrl)
            .then(function(html3) {
              var files = parseDir(html3).filter(function(f) {
                return /\.(mkv|mp4|avi|m3u8)$/i.test(decode(f));
              });
              var epf = files.find(function(f) {
                return epRe.test(decode(f));
              });
              if (!epf) throw new Error(ep+' not found');
              return [{
                name:    'DhakaFlix TV',
                title:   title + ' ' + ep,
                url:     safeUrl(seasonUrl, epf),
                quality: 'BDIX',
                headers: { 'User-Agent': UA }
              }];
            });
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix TV] ' + e.message);
      return [];
    });
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
        : getTvStreams(title, season, episode);
    })
    .catch(function(e) {
      console.error('[DhakaFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

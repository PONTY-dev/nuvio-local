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

function get(url) {
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) { return r.text(); });
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Extract folder names from HTML — checks href, data-name, JS strings, anywhere
function parseFolders(html) {
  var out = {}, seen = {};

  // Method 1: standard href links ending in /
  var re1 = /href=["']([^"'?#]+\/)["']/gi, m;
  while ((m = re1.exec(html)) !== null) {
    var h = m[1];
    if (h==='../'||h==='./'||h[0]==='/') continue;
    var name = safeDecodeFolder(h);
    if (name && !seen[name]) { seen[name]=1; out[name]=h; }
  }

  // Method 2: data-name, data-path, data-href attributes
  var re2 = /data-(?:name|path|href)=["']([^"']+\/)["']/gi;
  while ((m = re2.exec(html)) !== null) {
    var name2 = safeDecodeFolder(m[1]);
    if (name2 && !seen[name2]) { seen[name2]=1; out[name2]=m[1]; }
  }

  // Method 3: JS string values that look like folder names (quoted, contain year)
  var re3 = /["']([^"']*\(\d{4}[^)]*\)[^"']*\/)["']/g;
  while ((m = re3.exec(html)) !== null) {
    var name3 = safeDecodeFolder(m[1]);
    if (name3 && !seen[name3]) { seen[name3]=1; out[name3]=m[1]; }
  }

  return out; // { decodedName: rawHref }
}

// Extract video filenames from HTML — checks href, JS strings, data attrs
function parseVideoFiles(html) {
  var out = [], seen = {};

  // Method 1: href ending in video ext
  var re1 = /href=["']([^"'?#]+\.(?:mkv|mp4|avi))["']/gi, m;
  while ((m = re1.exec(html)) !== null) {
    var raw = m[1], name = safeDecodeFile(raw);
    if (name && !seen[name]) { seen[name]=1; out.push({raw:raw, name:name}); }
  }

  // Method 2: any quoted string ending in video ext
  var re2 = /["']([^"'\n\r]*\.(?:mkv|mp4|avi))["']/gi;
  while ((m = re2.exec(html)) !== null) {
    var raw2 = m[1], name2 = safeDecodeFile(raw2);
    if (name2 && !seen[name2] && name2.length > 5) {
      seen[name2]=1; out.push({raw:raw2, name:name2});
    }
  }

  // Method 3: data-name attr with video ext
  var re3 = /data-(?:name|file)=["']([^"']+\.(?:mkv|mp4|avi))["']/gi;
  while ((m = re3.exec(html)) !== null) {
    var raw3 = m[1], name3 = safeDecodeFile(raw3);
    if (name3 && !seen[name3]) { seen[name3]=1; out.push({raw:raw3, name:name3}); }
  }

  return out;
}

function safeDecodeFolder(s) {
  try { return decodeURIComponent(s.replace(/\/$/,'').replace(/\+/g,' ')); }
  catch(e) { return s.replace(/\/$/,''); }
}
function safeDecodeFile(s) {
  try { return decodeURIComponent(s.replace(/\+/g,' ')); }
  catch(e) { return s; }
}

function score(name, target) {
  var a = norm(
    name.replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
        .replace(/\s*\(\d{4}[^)]*\).*/,'')
        .replace(/\s*(1080p|720p|480p|4k|nf|amzn|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
  );
  var b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length>1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w)!==-1; }).length / words.length;
}

function qualLabel(name) {
  if (/1080p/i.test(name)) return '1080p';
  if (/720p/i.test(name))  return '720p';
  return 'SD';
}

// ── Movie crawler ─────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? e('(1960-1994)') : e('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';

  return get(yUrl)
    .then(function(html) {
      // Find best matching folder
      var folders = parseFolders(html);
      var best = null, top = 0;
      Object.keys(folders).forEach(function(name) {
        var s = score(name, title);
        if (s > top) { top = s; best = name; }
      });

      if (!best || top < 0.5) {
        console.error('[DhakaFlix Movie] no folder match for: '+title+' (score='+top+') folders='+Object.keys(folders).slice(0,3).join('|'));
        return [];
      }

      // Build movie folder URL safely
      var movieUrl = yUrl + e(best) + '/';
      console.error('[DhakaFlix Movie] folder='+best);

      return get(movieUrl)
        .then(function(html2) {
          var files = parseVideoFiles(html2);
          console.error('[DhakaFlix Movie] files found='+files.length+(files[0]?' first='+files[0].name:''));

          if (!files.length) return [];

          return files.map(function(f) {
            // If raw href is absolute path, use as-is; otherwise build from folder
            var fileUrl = f.raw.indexOf('://') !== -1
              ? f.raw
              : (f.raw.charAt(0) === '/'
                  ? 'http://172.16.50.7' + f.raw
                  : movieUrl + e(f.name));
            return {
              name:    'DhakaFlix ' + qualLabel(f.name),
              title:   title + ' (' + year + ')',
              url:     fileUrl,
              quality: 'BDIX',
              headers: { 'User-Agent': UA }
            };
          });
        });
    })
    .catch(function(err) {
      console.error('[DhakaFlix Movie] '+err.message);
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
    if (TV_RANGES[i].test(c)) { rng=TV_RANGES[i]; break; }
  }
  var rUrl = TV_BASE + rng.path;

  return get(rUrl)
    .then(function(html) {
      var folders = parseFolders(html);
      var best = null, top = 0;
      Object.keys(folders).forEach(function(name) {
        var s = score(name, title);
        if (s > top) { top = s; best = name; }
      });
      if (!best || top < 0.5) throw new Error('show not found: '+title);
      console.error('[DhakaFlix TV] show='+best);
      return rUrl + e(best) + '/';
    })
    .then(function(showUrl) {
      return get(showUrl).then(function(html) {
        var folders = parseFolders(html);
        var pat = new RegExp('^Season\\s*0*'+season+'$','i');
        var sf  = Object.keys(folders).find(function(n){ return pat.test(n.trim()); });
        if (!sf) throw new Error('season '+season+' not found');
        console.error('[DhakaFlix TV] season='+sf);
        return showUrl + e(sf) + '/';
      });
    })
    .then(function(seasonUrl) {
      return get(seasonUrl).then(function(html) {
        var files = parseVideoFiles(html);
        console.error('[DhakaFlix TV] ep files='+files.length);
        var epf = files.find(function(f){ return epRe.test(f.name); });
        if (!epf) throw new Error(ep+' not found');
        var fileUrl = epf.raw.charAt(0) === '/'
          ? 'http://172.16.50.12' + epf.raw
          : seasonUrl + e(epf.name);
        return [{
          name:    'DhakaFlix TV',
          title:   title+' '+ep,
          url:     fileUrl,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        }];
      });
    })
    .catch(function(err) {
      console.error('[DhakaFlix TV] '+err.message);
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
    .then(function(r){ return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title||d.original_title) : (d.name||d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date)||'').substring(0,4);
      if (!title || !year) return [];
      return isMov ? getMovieStreams(title, year) : getTvStreams(title, season, episode);
    })
    .catch(function(err) {
      console.error('[DhakaFlix] '+err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

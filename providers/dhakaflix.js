// providers/dhakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// MOVIE structure: /English Movies/(2024)/A Journey (2024) 720p NF [Dual Audio]/file.mkv
// TV structure:    /TV-WEB-Series/TV Series â™¥ Aâ€”L/Show (TV Series 2024â€“) 1080p/Season 1/S01E01.mkv

var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';
var TV_BASE    = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseDir(html) {
  var out = [], re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h==='../'||h==='./'||h.indexOf('://')!==-1||h[0]==='?'||h[0]==='/') continue;
    out.push(h);
  }
  return out;
}

function decode(href) {
  try { return decodeURIComponent(href.replace(/\/$/,'').replace(/\+/g,' ')); }
  catch(e) { return href.replace(/\/$/,''); }
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function scoreFolder(href, target) {
  var clean = decode(href)
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(1080p|720p|480p|4k|nf|amzn|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length > 1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w)!==-1; }).length / words.length;
}

function fetchText(url) {
  console.log('[DhakaFlix] Fetching:', url);
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
}

function qualLabel(f) {
  if (/1080p/i.test(f)) return '1080p';
  if (/720p/i.test(f))  return '720p';
  if (/480p/i.test(f))  return '480p';
  return 'SD';
}

function buildUrl(base, path) {
  if (!base.endsWith('/')) base += '/';
  if (path.startsWith('/')) path = path.slice(1);
  return new URL(path, base).href;
}

// â”€â”€ Movie crawler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getMovieStreams(title, year) {
  var yf = parseInt(year) <= 1994 ? '%281960-1994%29/' : '%28' + year + '%29/';
  var yearUrl = buildUrl(MOVIE_BASE, yf);

  return fetchText(yearUrl)
    .then(function(html) {
      var entries = parseDir(html);
      var best = null, top = 0;
      entries.forEach(function(e) {
        var s = scoreFolder(e, title);
        if (s > top) { top = s; best = e; }
      });
      if (!best || top < 0.5) {
        console.error('[DhakaFlix Movie] No match for: ' + title + ' (best score: ' + top + ')');
        return [];
      }
      var movieUrl = buildUrl(yearUrl, best);
      return fetchText(movieUrl)
        .then(function(html2) {
          var files = parseDir(html2).filter(function(f) {
            return /\.(mkv|mp4|avi)$/i.test(f);
          });
          if (!files.length) {
            console.error('[DhakaFlix Movie] No video files in folder: ' + movieUrl);
            return [];
          }
          return files.map(function(f) {
            var fileUrl = buildUrl(movieUrl, f);
            console.log('[DhakaFlix Movie] Found stream:', fileUrl);
            return {
              name:    'DhakaFlix ' + qualLabel(f),
              title:   title + ' (' + year + ')',
              url:     fileUrl,
              quality: 'BDIX',
              headers: { 'User-Agent': UA }
            };
          });
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix Movie] Error: ' + (e.message||e));
      return [];
    });
}

// â”€â”€ TV crawler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getTvStreams(title, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var ep   = 'S'+padS+'E'+padE;
  var epRe = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');

  var c = title.trim().charAt(0).toUpperCase();
  var range = TV_RANGES[1];
  for (var i = 0; i < TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { range = TV_RANGES[i]; break; }
  }
  var rangeUrl = buildUrl(TV_BASE, range.path);

  return fetchText(rangeUrl)
    .then(function(html) {
      var entries = parseDir(html);
      var best = null, top = 0;
      entries.forEach(function(e) {
        var s = scoreFolder(e, title);
        if (s > top) { top = s; best = e; }
      });
      if (!best || top < 0.5) throw new Error('Show not found: '+title);
      var showUrl = buildUrl(rangeUrl, best);
      return showUrl;
    })
    .then(function(showUrl) {
      return fetchText(showUrl)
        .then(function(html) {
          var entries = parseDir(html);
          var pat = new RegExp('^Season\\s*0*'+season+'\\s*/?$','i');
          var sf  = entries.find(function(e){ return pat.test(decode(e).trim()); });
          if (!sf) throw new Error('Season '+season+' not found');
          return buildUrl(showUrl, sf);
        });
    })
    .then(function(seasonUrl) {
      return fetchText(seasonUrl)
        .then(function(html) {
          var files = parseDir(html).filter(function(f){
            return /\.(mkv|mp4|avi|m3u8)$/i.test(f);
          });
          var epFile = files.find(function(f){ return epRe.test(decode(f)); });
          if (!epFile) throw new Error(ep+' not found');
          var fileUrl = buildUrl(seasonUrl, epFile);
          console.log('[DhakaFlix TV] Found episode:', fileUrl);
          return [{
            name:    'DhakaFlix TV',
            title:   title+' '+ep,
            url:     fileUrl,
            quality: 'BDIX',
            headers: { 'User-Agent': UA }
          }];
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix TV] Error: '+(e.message||e));
      return [];
    });
}

// â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type             : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/'+tmdbId+'?api_key='+TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/'   +tmdbId+'?api_key='+TMDB_KEY;

  console.log('[DhakaFlix] getStreams called, type='+type);

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? (data.title||data.original_title) : (data.name||data.original_name);
      var year  = ((isMovie ? data.release_date : data.first_air_date)||'').substring(0,4);
      if (!title) {
        console.error('[DhakaFlix] No title from TMDB');
        return [];
      }
      console.log('[DhakaFlix] TMDB data: title="'+title+'", year="'+year+'"');
      if (isMovie) return getMovieStreams(title, year);
      return getTvStreams(title, season, episode);
    })
    .catch(function(e) {
      console.error('[DhakaFlix] TMDB fetch error: '+(e.message||e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

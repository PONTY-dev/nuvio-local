// providers/dakaflix-movies.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Structure: /English Movies/(2024)/A Journey (2024) 720p NF [Dual Audio]/file.mkv

var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';

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
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(1080p|720p|480p|4k|nf|amzn|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length > 1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w)!==-1; }).length / words.length;
}

function qualLabel(f) {
  if (/1080p/i.test(f)) return '1080p';
  if (/720p/i.test(f))  return '720p';
  if (/480p/i.test(f))  return '480p';
  return 'SD';
}

function fetchText(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r){ return r.text(); });
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  if (type !== 'movie') return Promise.resolve([]);

  return fetch('https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var title = data.title || data.original_title;
      var year  = (data.release_date || '').substring(0, 4);
      if (!title || !year) return [];

      var yf = parseInt(year) <= 1994 ? '%281960-1994%29/' : '%28' + year + '%29/';
      var yearUrl = MOVIE_BASE + yf;

      return fetchText(yearUrl)
        .then(function(html) {
          var entries = parseDir(html);
          var best = null, top = 0;
          entries.forEach(function(e) {
            var s = scoreFolder(e, title);
            if (s > top) { top = s; best = e; }
          });
          if (!best || top < 0.5) {
            console.error('[DhakaFlix Movies] No match for: ' + title + ' score=' + top);
            return [];
          }
          var movieUrl = yearUrl + best;
          return fetchText(movieUrl)
            .then(function(html2) {
              var files = parseDir(html2).filter(function(f){
                return /\.(mkv|mp4|avi)$/i.test(f);
              });
              return files.map(function(f) {
                return {
                  name:    'DhakaFlix ' + qualLabel(f),
                  title:   title + ' (' + year + ')',
                  url:     movieUrl + f,
                  quality: 'BDIX',
                  headers: { 'User-Agent': UA }
                };
              });
            });
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix Movies] ' + (e.message||e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

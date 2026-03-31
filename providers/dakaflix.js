// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var MOVIE_BASE = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';
var TV_BASE    = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

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
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) { return r.text(); });
}

function qualLabel(f) {
  if (/1080p/i.test(f)) return '1080p';
  if (/720p/i.test(f))  return '720p';
  if (/480p/i.test(f))  return '480p';
  if (/web|webrip|web-dl/i.test(f)) return 'WEB';
  return 'SD';
}

function getMovieStreams(movieTitle, year) {
  return fetchText(MOVIE_BASE)
    .then(function(rootHtml) {
      var folders = parseDir(rootHtml);
      var y = parseInt(year);
      var bestFolder = null;

      // Dynamically find the correct folder since older movies like 1957 don't fit in 1960-1994
      for (var i = 0; i < folders.length; i++) {
        var f = decode(folders[i]).trim();
        if (f.indexOf('(' + year + ')') !== -1) {
          bestFolder = folders[i]; break;
        }
        var m = f.match(/\((\d{4})\s*-\s*(\d{4})\)/);
        if (m && y >= parseInt(m[1]) && y <= parseInt(m[2])) {
          bestFolder = folders[i]; break;
        }
      }

      // Fallback
      if (!bestFolder) {
        bestFolder = y <= 1994 ? '%281960-1994%29/' : '%28' + year + '%29/';
      }

      var yearUrl = MOVIE_BASE + bestFolder;

      return fetchText(yearUrl).then(function(html) {
        var entries = parseDir(html);
        var best = null, top = 0;
        entries.forEach(function(e) {
          var s = scoreFolder(e, movieTitle);
          if (s > top) { top = s; best = e; }
        });
        
        if (!best || top < 0.5) return [];
        
        var movieUrl = yearUrl + best;
        return fetchText(movieUrl).then(function(html2) {
          var files = parseDir(html2).filter(function(f) {
            return /\.(mkv|mp4|avi)$/i.test(f);
          });
          if (!files.length) return [];
          
          return files.map(function(f) {
            var mainText = 'DhakaFlix ' + qualLabel(f) + ' - BDIX';
            var subText = movieTitle + ' (' + year + ') BDIX';
            
            return {
              name:        mainText,  
              server:      mainText, // Maps to main UI text in some app frameworks
              title:       subText,   
              description: subText,  // Maps to sub UI text in apps like CloudStream
              url:         movieUrl + f,
              quality:     'BDIX',
              headers:     { 'User-Agent': UA }
            };
          });
        });
      });
    }).catch(function(e) {
      console.error('[DhakaFlix Movie] ' + (e.message||e));
      return []; 
    });
}

function getTvStreams(showTitle, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var ep   = 'S'+padS+'E'+padE;
  var epRe = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');

  var c = showTitle.trim().charAt(0).toUpperCase();
  var range = TV_RANGES[1]; 
  for (var i = 0; i < TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) { range = TV_RANGES[i]; break; }
  }
  var rangeUrl = TV_BASE + range.path;

  return fetchText(rangeUrl)
    .then(function(html) {
      var entries = parseDir(html);
      var best = null, top = 0;
      entries.forEach(function(e) {
        var s = scoreFolder(e, showTitle);
        if (s > top) { top = s; best = e; }
      });
      if (!best || top < 0.5) throw new Error('Show not found');
      return rangeUrl + best;
    })
    .then(function(showUrl) {
      return fetchText(showUrl)
        .then(function(html) {
          var entries = parseDir(html);
          var pat = new RegExp('^Season\\s*0*'+season+'\\s*/?$','i');
          var sf  = entries.find(function(e){ return pat.test(decode(e).trim()); });
          if (!sf) throw new Error('Season not found');
          return showUrl + sf;
        });
    })
    .then(function(seasonUrl) {
      return fetchText(seasonUrl)
        .then(function(html) {
          var files = parseDir(html).filter(function(f){
            return /\.(mkv|mp4|avi|m3u8)$/i.test(f);
          });
          var epFile = files.find(function(f){ return epRe.test(decode(f)); });
          if (!epFile) throw new Error('Episode not found');
          
          var mainText = 'DhakaFlix TV - BDIX';
          var subText = showTitle + ' ' + ep + ' BDIX';

          return [{
            name:        mainText,
            server:      mainText,
            title:       subText,
            description: subText,
            url:         seasonUrl + epFile,
            quality:     'BDIX',
            headers:     { 'User-Agent': UA }
          }];
        });
    })
    .catch(function(e) { 
      console.error('[DhakaFlix TV] '+(e.message||e));
      return []; 
    });
}

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type             : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/'+tmdbId+'?api_key='+TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/'   +tmdbId+'?api_key='+TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? (data.title||data.original_title) : (data.name||data.original_name);
      var year  = ((isMovie ? data.release_date : data.first_air_date)||'').substring(0,4);
      if (!title || !year) return [];
      if (isMovie) return getMovieStreams(title, year);
      return getTvStreams(title, season, episode);
    })
    .catch(function(e) {
      console.error('[DhakaFlix] '+(e.message||e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
var TMDB_KEY    = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA          = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var MOVIE_HOST  = 'http://172.16.50.7';
var MOVIE_BASE  = MOVIE_HOST + '/DHAKA-FLIX-7/English%20Movies/';
var TV_HOST     = 'http://172.16.50.12';
var TV_BASE     = TV_HOST + '/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function e(s) { return encodeURIComponent(s); }
function dec(s) { try { return decodeURIComponent(s.replace(/\+/g,' ')); } catch(x) { return s; } }

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function titleScore(folderName, target) {
  var clean = folderName
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(uncut|1080p|720p|480p|4k|nf|amzn|amz|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length > 1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w) !== -1; }).length / words.length;
}

// Parse ALL hrefs including absolute paths like /DHAKA-FLIX-7/...
function parseHrefs(html, host) {
  var out = [], seen = {};
  var re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === './' || h.indexOf('://') !== -1) continue;
    // Convert absolute path to full URL
    if (h.charAt(0) === '/') h = host + h;
    if (!seen[h]) { seen[h] = 1; out.push(h); }
  }
  return out;
}

function get(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r){ return r.text(); });
}

// ── Movie builder ─────────────────────────────────────────────────────────────
// Strategy:
//   1. Try crawling the year folder to find real folder + file
//   2. Fall back to pattern-based guessing using confirmed real patterns

function movieFileGuesses(title, year, folderName) {
  var t  = title + ' (' + year + ')';
  var dt = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');
  var fn = folderName || '';

  // Determine source from folder name suffix
  var isNF   = /\bNF\b/i.test(fn);
  var isAMZN = /\bAMZN\b|\bAMZ\b/i.test(fn);
  var isWEB  = /WEBRip/i.test(fn) && !isNF && !isAMZN;
  var isDual = /\[Dual Audio\]/i.test(fn);

  var guesses = [];

  if (isNF && isDual) {
    // Confirmed: A Journey, A Family Affair
    guesses.push(t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv');
    guesses.push(t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -mkvC.mkv');
    guesses.push(t + ' 720p NF-WEB x264 [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv');
    guesses.push(t + ' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv');
  }
  if (isAMZN && isDual) {
    // Confirmed: A Game in the Woods
    guesses.push(t + ' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv');
    guesses.push(t + ' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv');
    guesses.push(t + ' UNCUT 720p AMZN-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv');
    guesses.push(t + ' 720p AMZN-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv');
    guesses.push(t + ' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv');
  }
  if (isWEB) {
    // Confirmed: A Mistake - dot format
    guesses.push(dt + '.' + year + '.720p.WEBRip.800MB.x264-GalaxyRG.mkv');
    guesses.push(dt + '.' + year + '.720p.WEBRip.x264-GalaxyRG.mkv');
    guesses.push(dt + '.' + year + '.720p.WEBRip.x264.mkv');
    guesses.push(dt + '.' + year + '.720p.WEBRip.800MB.x264.mkv');
  }
  // Generic dual audio (no specific source detected)
  if (isDual && !isNF && !isAMZN) {
    guesses.push(t + ' 720p WEB-DL x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv');
    guesses.push(t + ' 720p WEB-DL x264 [Dual Audio] -mkvC.mkv');
  }
  // Old BluRay dot format (confirmed: 12 Angry Men)
  guesses.push(dt + '.' + year + '.720p.BluRay.x264.ESub-Pahe.mkv');
  guesses.push(dt + '.' + year + '.720p.BluRay.x264.mkv');
  guesses.push(dt + '.' + year + '.1080p.BluRay.x264.mkv');
  // Generic fallbacks
  guesses.push(t + ' 720p.mkv');
  guesses.push(dt + '.' + year + '.720p.mkv');

  return guesses;
}

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? e('(1960-1994)') : e('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';

  // Try crawl first
  return get(yUrl)
    .then(function(html) {
      var hrefs = parseHrefs(html, MOVIE_HOST);
      console.error('[DFlix] year hrefs=' + hrefs.length + ' sample=' + (hrefs[0]||'none'));

      // Find best matching folder URL
      var best = null, bestName = '', top = 0;
      hrefs.forEach(function(h) {
        // Get the last path segment as folder name
        var parts = dec(h).replace(/\/$/,'').split('/');
        var name  = parts[parts.length - 1];
        var s     = titleScore(name, title);
        if (s > top) { top = s; best = h; bestName = name; }
      });

      if (best && top >= 0.5) {
        console.error('[DFlix] folder=' + bestName + ' score=' + top);
        var folderUrl = best.slice(-1) === '/' ? best : best + '/';

        return get(folderUrl)
          .then(function(html2) {
            var fileHrefs = parseHrefs(html2, MOVIE_HOST);
            console.error('[DFlix] file hrefs=' + fileHrefs.length);
            var videos = fileHrefs.filter(function(h){
              return /\.(mkv|mp4|avi)$/i.test(dec(h));
            });
            if (videos.length) {
              return videos.map(function(h) {
                var fname = dec(h).replace(/.*\//,'');
                var q = /1080p/i.test(fname)?'1080p':/720p/i.test(fname)?'720p':'SD';
                return { name:'DhakaFlix '+q, title:t, url:h, quality:'BDIX', headers:{'User-Agent':UA} };
              });
            }
            // Crawl found folder but no file hrefs — fall back to guessing
            console.error('[DFlix] no file hrefs, guessing from folder: ' + bestName);
            return buildGuessStreams(folderUrl, bestName, title, year, t);
          });
      }

      // Crawl found no folder — full guess mode
      console.error('[DFlix] no folder match, pure guess mode');
      return buildGuessStreams(null, '', title, year, t);
    })
    .catch(function(err) {
      console.error('[DFlix Movie] crawl error: ' + err.message + ' — falling back to guesses');
      return buildGuessStreams(null, '', title, year, t);
    });
}

function buildGuessStreams(folderUrl, folderName, title, year, t) {
  var guesses = movieFileGuesses(title, year, folderName);
  var dt = title.replace(/[^a-zA-Z0-9]/g,'.').replace(/\.+/g,'.');

  // Folder URL variants to try if we didn't find it via crawl
  var yf  = parseInt(year) <= 1994 ? e('(1960-1994)') : e('('+year+')');
  var yUrl = MOVIE_BASE + yf + '/';

  var folderVariants = folderUrl ? [folderUrl] : [
    yUrl + e(t + ' 720p NF [Dual Audio]')   + '/',
    yUrl + e(t + ' 720p AMZN [Dual Audio]') + '/',
    yUrl + e(t + ' 720p AMZ [Dual Audio]')  + '/',
    yUrl + e(t + ' 720p WEBRip')            + '/',
    yUrl + e(t + ' 720p [Dual Audio]')      + '/',
    yUrl + e(t + ' 720p')                   + '/',
    yUrl + e(t + ' 1080p NF [Dual Audio]')  + '/',
    yUrl + e(t + ' 1080p AMZN [Dual Audio]')+ '/',
    yUrl + e(t + ' 1080p')                  + '/'
  ];

  var seen = {}, streams = [];
  folderVariants.forEach(function(fv) {
    guesses.forEach(function(g) {
      var url = fv + e(g);
      if (!seen[url]) {
        seen[url] = 1;
        var q = /1080p/i.test(g)?'1080p':/720p/i.test(g)?'720p':'SD';
        streams.push({ name:'DhakaFlix '+q, title:t, url:url, quality:'BDIX', headers:{'User-Agent':UA} });
      }
    });
  });
  return streams;
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
      var hrefs = parseHrefs(html, TV_HOST);
      var best = null, top = 0;
      hrefs.forEach(function(h) {
        var parts = dec(h).replace(/\/$/,'').split('/');
        var name  = parts[parts.length-1];
        var s     = titleScore(name, title);
        if (s > top) { top=s; best=h; }
      });
      if (!best || top < 0.5) throw new Error('show not found: '+title);
      var showUrl = best.slice(-1)==='/' ? best : best+'/';
      return get(showUrl);
    })
    .then(function(html) {
      var hrefs = parseHrefs(html, TV_HOST);
      var pat   = new RegExp('Season\\s*0*'+season+'$','i');
      var sf    = hrefs.find(function(h){
        return pat.test(dec(h).replace(/\/$/,'').split('/').pop().trim());
      });
      if (!sf) throw new Error('season '+season+' not found');
      var seasonUrl = sf.slice(-1)==='/' ? sf : sf+'/';
      return get(seasonUrl);
    })
    .then(function(html) {
      var hrefs  = parseHrefs(html, TV_HOST);
      var videos = hrefs.filter(function(h){ return /\.(mkv|mp4|avi|m3u8)$/i.test(dec(h)); });
      var epFile = videos.find(function(h){ return epRe.test(dec(h)); });
      if (!epFile) throw new Error(ep+' not found');
      return [{ name:'DhakaFlix TV', title:title+' '+ep, url:epFile, quality:'BDIX', headers:{'User-Agent':UA} }];
    })
    .catch(function(err) {
      console.error('[DFlix TV] '+err.message);
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
      console.error('[DFlix] '+err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

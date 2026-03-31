// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// ── Unchanged movie helpers ───────────────────────────────────────────────────

function dotTitle(title) {
  return title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
}

function getYearFolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

// ── TV helpers ────────────────────────────────────────────────────────────────

function getTvRangeUrl(title) {
  var c = title.trim().charAt(0).toUpperCase();
  var path;
  if (c >= '0' && c <= '9') path = 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/';
  else if (c >= 'A' && c <= 'L') path = 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/';
  else if (c >= 'M' && c <= 'R') path = 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/';
  else path = 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/';
  return 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/' + path;
}

function parseDir(html) {
  var out = [], re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === './' || h.indexOf('://') !== -1 || h[0] === '?' || h[0] === '/') continue;
    out.push(h);
  }
  return out;
}

function decode(href) {
  try { return decodeURIComponent(href.replace(/\/$/, '').replace(/\+/g, ' ')); }
  catch(e) { return href.replace(/\/$/, ''); }
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Score how well a server folder name matches the target show title
function scoreFolder(href, target) {
  var clean = decode(href)
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i, '')
    .replace(/\s*(1080p|720p|480p|4k|dual\s*audio|\[.*?\]).*/i, '')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w) { return w.length > 1; });
  if (!words.length) return 0;
  return words.filter(function(w) { return a.indexOf(w) !== -1; }).length / words.length;
}

function findBest(entries, target) {
  var best = null, top = 0;
  entries.forEach(function(e) {
    var s = scoreFolder(e, target);
    if (s > top) { top = s; best = e; }
  });
  return (best && top >= 0.5) ? best : null;
}

// ── TV crawler ────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode, ua) {
  var padS = season  < 10 ? '0' + season  : '' + season;
  var padE = episode < 10 ? '0' + episode : '' + episode;
  var ep   = 'S' + padS + 'E' + padE;
  var epRe = new RegExp('S0*' + season + 'E0*' + episode + '(?!\\d)', 'i');
  var rangeUrl = getTvRangeUrl(title);
  var headers  = { 'User-Agent': ua };

  // Step 1 — find real show folder name in range bucket
  return fetch(rangeUrl, { headers: headers })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var best = findBest(parseDir(html), title);
      if (!best) throw new Error('Show not found: ' + title);
      return rangeUrl + best;
    })

    // Step 2 — find Season N folder
    .then(function(showUrl) {
      return fetch(showUrl, { headers: headers })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var entries = parseDir(html);
          var pat = new RegExp('^Season\\s*0*' + season + '\\s*/?$', 'i');
          var sf  = entries.find(function(e) { return pat.test(decode(e).trim()); });
          if (!sf) throw new Error('Season ' + season + ' not found');
          return showUrl + sf;
        });
    })

    // Step 3 — find S__E__ video file
    .then(function(seasonUrl) {
      return fetch(seasonUrl, { headers: headers })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var files = parseDir(html).filter(function(e) {
            return /\.(mkv|mp4|avi|m3u8)$/i.test(e);
          });
          var epFile = files.find(function(f) { return epRe.test(decode(f)); });
          if (!epFile) throw new Error(ep + ' file not found');
          return [{
            name:    'DhakaFlix TV',
            title:   title + ' ' + ep,
            url:     seasonUrl + epFile,
            quality: 'BDIX',
            headers: headers
          }];
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix TV] ' + (e.message || e));
      return [];
    });
}

// ── Entry point ───────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type          : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/'    + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var year  = ((isMovie ? data.release_date : data.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];

      // ── Movies (original logic — untouched) ──────────────────────────────
      if (isMovie) {
        var dt          = dotTitle(title);
        var folderTitle = encodeURIComponent(title + ' (' + year + ')');
        var yf          = encodeURIComponent(getYearFolder(year));
        var base        = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/' + yf + '/' + folderTitle;
        var results = [
          { name: 'DhakaFlix 720p',  url: base + '%20720p/' + dt + '.' + year + '.720p.BluRay.x264.mkv' },
          { name: 'DhakaFlix 1080p', url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies%20(1080p)/' + yf + '%201080p/' + folderTitle + '%201080p/' + dt + '.' + year + '.1080p.BluRay.x264.mkv' },
          { name: 'DhakaFlix WEB',   url: base + '%20720p/' + dt + '.' + year + '.720p.WEBRip.x264.mkv' }
        ];
        var padS0 = season  < 10 ? '0' + season  : '' + season;
        var padE0 = episode < 10 ? '0' + episode : '' + episode;
        return results.map(function(r) {
          return {
            name:    r.name,
            title:   title + ' (' + year + ')',
            url:     r.url,
            quality: 'BDIX',
            headers: { 'User-Agent': UA }
          };
        });
      }

      // ── TV (directory crawl — finds real folder names) ───────────────────
      return getTvStreams(title, season, episode, UA);
    })
    .catch(function(e) {
      console.error('[DhakaFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var MOVIE_BASES = [
  'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/',
  'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies%20(1080p)/'
];

var TV_BASE = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function scoreFolder(href, target) {
  // Strip server metadata suffixes before comparing
  var clean = decode(href)
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i, '')
    .replace(/\s*\(\d{4}[^)]*\).*/i, '')
    .replace(/\s*(1080p|720p|480p|4k|dual\s*audio|bluray|webrip|web-dl|\[.*?\]).*/i, '')
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

function fetchDir(url) {
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) { return r.text(); })
    .then(function(html) { return parseDir(html); });
}

function qualScore(f) {
  if (/1080p/i.test(f)) return 3;
  if (/720p/i.test(f))  return 2;
  if (/480p/i.test(f))  return 1;
  return 0;
}

// ── Movie crawler ─────────────────────────────────────────────────────────────
// Structure: /English Movies/<YEAR FOLDER>/<Show (Year) [quality]>/<file.mkv>

function getMovieStreams(title, year) {
  // Search both movie bases (720p root + 1080p root) in parallel
  return Promise.all(MOVIE_BASES.map(function(base) {
    return fetchDir(base)
      .then(function(entries) {
        // Find year folder: "(2024)", "(1960-1994)", "(2024) 1080p" etc.
        var yearFolders = entries.filter(function(e) {
          return e.indexOf(encodeURIComponent(year)) !== -1 ||
                 decode(e).indexOf(year) !== -1;
        });
        if (!yearFolders.length) return [];

        return Promise.all(yearFolders.map(function(yf) {
          return fetchDir(base + yf)
            .then(function(showEntries) {
              var match = findBest(showEntries, title);
              if (!match) return [];

              var showUrl = base + yf + match;
              // Descend into show folder to find the video file
              return fetchDir(showUrl)
                .then(function(files) {
                  var videos = files.filter(function(f) {
                    return /\.(mkv|mp4|avi)$/i.test(f);
                  });
                  if (!videos.length) {
                    // Files might be directly in year folder (no show subfolder)
                    videos = showEntries.filter(function(f) {
                      return /\.(mkv|mp4|avi)$/i.test(f);
                    });
                    if (!videos.length) return [];
                    videos.sort(function(a, b) { return qualScore(b) - qualScore(a); });
                    return videos.map(function(f) {
                      return {
                        name:    'DhakaFlix ' + (qualScore(f) === 3 ? '1080p' : qualScore(f) === 2 ? '720p' : 'SD'),
                        title:   title + ' (' + year + ')',
                        url:     base + yf + f,
                        quality: 'BDIX',
                        headers: { 'User-Agent': UA }
                      };
                    });
                  }
                  videos.sort(function(a, b) { return qualScore(b) - qualScore(a); });
                  return videos.map(function(f) {
                    return {
                      name:    'DhakaFlix ' + (qualScore(f) === 3 ? '1080p' : qualScore(f) === 2 ? '720p' : 'SD'),
                      title:   title + ' (' + year + ')',
                      url:     showUrl + f,
                      quality: 'BDIX',
                      headers: { 'User-Agent': UA }
                    };
                  });
                })
                .catch(function() { return []; });
            })
            .catch(function() { return []; });
        }));
      })
      .then(function(results) {
        return [].concat.apply([], results);
      })
      .catch(function() { return []; });
  }))
  .then(function(allResults) {
    return [].concat.apply([], allResults);
  })
  .catch(function(e) {
    console.error('[DhakaFlix Movie] ' + (e.message || e));
    return [];
  });
}

// ── TV crawler ────────────────────────────────────────────────────────────────
// Structure: /TV-WEB-Series/<RANGE>/<Show (TV Series Year)>/<Season N>/<S01E01.mkv>

function getTvRangeUrl(title) {
  var c = title.trim().charAt(0).toUpperCase();
  var path;
  if      (c >= '0' && c <= '9') path = 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/';
  else if (c >= 'A' && c <= 'L') path = 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/';
  else if (c >= 'M' && c <= 'R') path = 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/';
  else                            path = 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/';
  return TV_BASE + path;
}

function getTvStreams(title, season, episode) {
  var padS = season  < 10 ? '0' + season  : '' + season;
  var padE = episode < 10 ? '0' + episode : '' + episode;
  var ep   = 'S' + padS + 'E' + padE;
  var epRe = new RegExp('S0*' + season + 'E0*' + episode + '(?!\\d)', 'i');
  var rangeUrl = getTvRangeUrl(title);

  return fetchDir(rangeUrl)
    .then(function(entries) {
      var match = findBest(entries, title);
      if (!match) throw new Error('Show not found: ' + title);
      return rangeUrl + match;
    })
    .then(function(showUrl) {
      return fetchDir(showUrl)
        .then(function(entries) {
          var pat = new RegExp('^Season\\s*0*' + season + '\\s*/?$', 'i');
          var sf  = entries.find(function(e) { return pat.test(decode(e).trim()); });
          if (!sf) throw new Error('Season ' + season + ' not found');
          return showUrl + sf;
        });
    })
    .then(function(seasonUrl) {
      return fetchDir(seasonUrl)
        .then(function(files) {
          var videos = files.filter(function(f) { return /\.(mkv|mp4|avi|m3u8)$/i.test(f); });
          var epFile = videos.find(function(f) { return epRe.test(decode(f)); });
          if (!epFile) throw new Error(ep + ' not found');
          return [{
            name:    'DhakaFlix TV',
            title:   title + ' ' + ep,
            url:     seasonUrl + epFile,
            quality: 'BDIX',
            headers: { 'User-Agent': UA }
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
  var type    = media && media.type    ? media.type             : 'movie';
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
      if (isMovie) return getMovieStreams(title, year);
      return getTvStreams(title, season, episode);
    })
    .catch(function(e) {
      console.error('[DhakaFlix] ' + (e.message || e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

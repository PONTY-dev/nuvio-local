// providers/dakaflix-tv.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// TV structure:
//   http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/
//     TV Series ★ 0 — 9/
//     TV Series ♥ A — L/
//     TV Series ♦ M — R/
//     TV Series ♦ S — Z/
//       Show Name (TV Series 2024– ) 1080p [Dual Audio]/
//         Season 1/
//           ShowName.S01E01.mkv

var TV_BASE = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function getRangeUrl(title) {
  var c = title.trim().charAt(0).toUpperCase();
  for (var i = 0; i < TV_RANGES.length; i++) {
    if (TV_RANGES[i].test(c)) return TV_BASE + TV_RANGES[i].path;
  }
  return TV_BASE + TV_RANGES[1].path;
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

function fetchText(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) { return r.text(); });
}

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type             : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  if (type !== 'tv') return Promise.resolve([]);

  var padS = season  < 10 ? '0' + season  : '' + season;
  var padE = episode < 10 ? '0' + episode : '' + episode;
  var ep   = 'S' + padS + 'E' + padE;
  var epRe = new RegExp('S0*' + season + 'E0*' + episode + '(?!\\d)', 'i');

  var tmdbUrl = 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = data.name || data.original_name;
      if (!title) return [];

      var rangeUrl = getRangeUrl(title);

      // Step 1 — find show folder
      return fetchText(rangeUrl)
        .then(function(html) {
          var entries = parseDir(html);
          var best = null, top = 0;
          entries.forEach(function(e) {
            var s = scoreFolder(e, title);
            if (s > top) { top = s; best = e; }
          });
          if (!best || top < 0.5) throw new Error('Show not found: ' + title);
          return rangeUrl + best;
        })

        // Step 2 — find Season N
        .then(function(showUrl) {
          return fetchText(showUrl)
            .then(function(html) {
              var entries = parseDir(html);
              var pat = new RegExp('^Season\\s*0*' + season + '\\s*/?$', 'i');
              var sf  = entries.find(function(e) { return pat.test(decode(e).trim()); });
              if (!sf) throw new Error('Season ' + season + ' not found');
              return showUrl + sf;
            });
        })

        // Step 3 — find episode file
        .then(function(seasonUrl) {
          return fetchText(seasonUrl)
            .then(function(html) {
              var files = parseDir(html).filter(function(f) {
                return /\.(mkv|mp4|avi|m3u8)$/i.test(f);
              });
              var epFile = files.find(function(f) { return epRe.test(decode(f)); });
              if (!epFile) throw new Error(ep + ' not found');
              return [{
                name:    'DhakaFlix TV',
                title:   title + ' ' + ep,
                url:     seasonUrl + epFile,
                quality: 'BDIX',
                headers: { 'User-Agent': UA }
              }];
            });
        });
    })
    .catch(function(e) {
      console.error('[DhakaFlix TV] ' + (e.message || e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

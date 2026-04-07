// providers/dakaflix.js
// Ported from CloudStream BdixDhakaFlix14Provider.kt
// Uses h5ai search API + table HTML parsing (td.fb-n > a)

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var SERVERS = [
  { host: 'http://172.16.50.7',  name: 'DHAKA-FLIX-7',  moviePath: 'English%20Movies/',        label: '720p'  },
  { host: 'http://172.16.50.14', name: 'DHAKA-FLIX-14', moviePath: 'English%20Movies%20%281080p%29/', label: '1080p' }
];

var TV_SERVER = { host: 'http://172.16.50.12', name: 'DHAKA-FLIX-12', tvPath: 'TV-WEB-Series/' };

// ── h5ai search API ───────────────────────────────────────────────────────────
// POST /<serverName>/ with JSON {"action":"get","search":{"href":"/<serverName>/","pattern":"query","ignorecase":true}}
// Returns {"search":[{"href":"/path/","size":null,...},...]}, size=null means folder

function h5aiSearch(host, serverName, query) {
  var url  = host + '/' + serverName + '/';
  var body = JSON.stringify({
    action: 'get',
    search: { href: '/' + serverName + '/', pattern: query, ignorecase: true }
  });
  return fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body:    body
  })
  .then(function(r) { return r.json(); })
  .then(function(json) {
    // Return only folders (size === null) that are not season/episode folders
    var results = json && json.search ? json.search : [];
    var folders = [], i;
    for (i = 0; i < results.length; i++) {
      if (results[i].size === null || results[i].size === undefined) {
        folders.push(results[i].href);
      }
    }
    return folders;
  })
  .catch(function() { return []; });
}

// ── h5ai HTML parser ──────────────────────────────────────────────────────────
// h5ai renders: <tbody><tr>header</tr><tr><td class="fb-i"><img alt="folder"/></td><td class="fb-n"><a href="/path/">Name</a></td>...
// We parse td.fb-n > a hrefs from the HTML

function h5aiListDir(host, encodedPath) {
  var url = host + encodedPath;
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var files = [], folders = [], m;
      // Match <td class="fb-n"><a href="...">
      var re = /<td[^>]*class="fb-n"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>/gi;
      while ((m = re.exec(html)) !== null) {
        var href = m[1];
        if (!href || href.indexOf('?') !== -1) continue;
        var name = decodeURIComponent(href.split('/').filter(Boolean).pop() || '');
        if (/\.(mkv|mp4|avi)$/i.test(name)) {
          files.push({ href: href, name: name });
        } else if (href.slice(-1) === '/') {
          folders.push({ href: href, name: name });
        }
      }
      return { files: files, folders: folders };
    })
    .catch(function() { return { files: [], folders: [] }; });
}

function dec(s) {
  try { return decodeURIComponent(s.replace(/\+/g,' ')); }
  catch(e) { return s; }
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function titleScore(name, target) {
  var clean = name
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*\(\d{4}[^)]*\).*/,'')
    .replace(/\s*(uncut|1080p|720p|4k|nf|amzn|dsnp|web-dl|webrip|bluray|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' '), good = [], hits = 0, i;
  for (i = 0; i < words.length; i++) { if (words[i].length > 1) good.push(words[i]); }
  if (!good.length) return 0;
  for (i = 0; i < good.length; i++) { if (a.indexOf(good[i]) !== -1) hits++; }
  return hits / good.length;
}

// ── Movie ─────────────────────────────────────────────────────────────────────

function getMovieStreams(title, year) {
  var t = title + ' (' + year + ')';
  // Search both servers in parallel
  var searches = [], i;
  for (i = 0; i < SERVERS.length; i++) {
    searches.push(searchMovieOnServer(SERVERS[i], title, year, t));
  }
  return Promise.all(searches).then(function(results) {
    var out = [], j;
    for (j = 0; j < results.length; j++) {
      var arr = results[j];
      var k;
      for (k = 0; k < arr.length; k++) out.push(arr[k]);
    }
    return out;
  });
}

function searchMovieOnServer(server, title, year, t) {
  return h5aiSearch(server.host, server.name, title)
    .then(function(hrefs) {
      // Find best matching folder
      var best = null, top = 0, i;
      for (i = 0; i < hrefs.length; i++) {
        var name = dec(hrefs[i]).replace(/\/$/, '').split('/').pop();
        // Must contain the year to avoid false matches
        if (name.indexOf(year) === -1) continue;
        var s = titleScore(name, title);
        if (s > top) { top = s; best = hrefs[i]; }
      }

      if (!best || top < 0.5) return [];

      var folderPath = best.slice(-1) === '/' ? best : best + '/';
      console.error('[DFlix] server=' + server.label + ' folder=' + dec(best));

      // Fetch folder and get the video file
      return h5aiListDir(server.host, folderPath)
        .then(function(listing) {
          var out = [], j;
          for (j = 0; j < listing.files.length; j++) {
            var f    = listing.files[j];
            var furl = f.href.indexOf('://') !== -1
              ? f.href
              : server.host + f.href;
            var q = /1080p/i.test(f.name) ? '1080p' : '720p';
            out.push({
              name:    'DhakaFlix ' + q,
              title:   t,
              url:     furl,
              quality: 'BDIX',
              headers: { 'User-Agent': UA }
            });
          }
          return out;
        });
    })
    .catch(function() { return []; });
}

// ── TV ────────────────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS    = season  < 10 ? '0'+season  : ''+season;
  var padE    = episode < 10 ? '0'+episode : ''+episode;
  var epLabel = 'S'+padS+'E'+padE;
  var epRe    = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)', 'i');

  return h5aiSearch(TV_SERVER.host, TV_SERVER.name, title)
    .then(function(hrefs) {
      var best = null, top = 0, i;
      for (i = 0; i < hrefs.length; i++) {
        var name = dec(hrefs[i]).replace(/\/$/, '').split('/').pop();
        var s = titleScore(name, title);
        if (s > top) { top = s; best = hrefs[i]; }
      }
      if (!best || top < 0.5) throw new Error('show not found: ' + title);

      var showPath = best.slice(-1) === '/' ? best : best + '/';
      console.error('[DFlix TV] show=' + dec(best));
      return h5aiListDir(TV_SERVER.host, showPath);
    })
    .then(function(listing) {
      // Find season folder
      var pat = new RegExp('Season\\s*0*' + season + '$', 'i');
      var sf  = null, i;
      for (i = 0; i < listing.folders.length; i++) {
        if (pat.test(listing.folders[i].name.trim())) { sf = listing.folders[i]; break; }
      }
      if (!sf) throw new Error('season ' + season + ' not found');
      return h5aiListDir(TV_SERVER.host, sf.href);
    })
    .then(function(listing) {
      var epFile = null, i;
      for (i = 0; i < listing.files.length; i++) {
        if (epRe.test(listing.files[i].name)) { epFile = listing.files[i]; break; }
      }
      if (!epFile) throw new Error(epLabel + ' not found');
      var furl = epFile.href.indexOf('://') !== -1
        ? epFile.href
        : TV_SERVER.host + epFile.href;
      return [{
        name:    'DhakaFlix TV',
        title:   title + ' ' + epLabel,
        url:     furl,
        quality: 'BDIX',
        headers: { 'User-Agent': UA }
      }];
    })
    .catch(function(err) {
      console.error('[DFlix TV] ' + err.message);
      return [];
    });
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type                  : 'movie';
  var season  = media && media.season  ? parseInt(media.season,  10) : 1;
  var episode = media && media.episode ? parseInt(media.episode, 10) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title || d.original_title) : (d.name || d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];
      return isMov ? getMovieStreams(title, year) : getTvStreams(title, season, episode);
    })
    .catch(function(err) {
      console.error('[DFlix] ' + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

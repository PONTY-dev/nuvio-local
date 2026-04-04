// ─────────────────────────────────────────────
// DhakaFlix Ultimate Provider (Cloudstream Style)
// ─────────────────────────────────────────────

var TMDB_KEY   = 'fe4a8b69f7867dea332c4495faeab4c6';

var MOVIE_HOST = 'http://172.16.50.7';
var MOVIE_BASE = MOVIE_HOST + '/DHAKA-FLIX-7/English%20Movies/';

var TV_HOST    = 'http://172.16.50.12';
var TV_BASE    = TV_HOST + '/DHAKA-FLIX-12/TV-WEB-Series/';

var UA_MOB = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function ep(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }
function dec(s) { try { return decodeURIComponent(s.replace(/\+/g,' ')); } catch(e){ return s; } }

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function titleScore(name, target) {
  var a = norm(name), b = norm(target);
  var words = b.split(' ').filter(w => w.length > 1);
  if (!words.length) return 0;

  var hit = 0;
  words.forEach(w => { if (a.includes(w)) hit++; });

  return hit / words.length;
}

// ─────────────────────────────────────────────
// Fast Fetch (timeout safe)
// ─────────────────────────────────────────────

function fetchPage(url, ua, timeout = 6000) {
  return Promise.race([
    fetch(url, { headers: { 'User-Agent': ua } }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]).then(r => r.text());
}

// ─────────────────────────────────────────────
// Server Detection
// ─────────────────────────────────────────────

function detectServerType(html) {
  html = html.toLowerCase();

  if (html.includes('index of /')) return 'apache';
  if (html.includes('nginx')) return 'nginx';
  if (html.includes('<script')) return 'custom-js';

  return 'custom';
}

// ─────────────────────────────────────────────
// Smart Link Extractor
// ─────────────────────────────────────────────

function extractLinks(html, host) {
  var type = detectServerType(html);
  var out = [], seen = {};

  function add(link) {
    if (!seen[link]) {
      seen[link] = 1;
      out.push(link);
    }
  }

  // Normal href
  var re = /href=["']([^"'?#]+)["']/gi, m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === './') continue;
    if (h.startsWith('/')) h = host + h;
    add(h);
  }

  // Direct video links
  var vidRe = /(https?:\/\/[^\s"'<>]+?\.(mkv|mp4|avi|m3u8))/gi, m2;
  while ((m2 = vidRe.exec(html)) !== null) {
    add(m2[1]);
  }

  // Download buttons
  var dlRe = /href=["']([^"']*(download|dl)[^"']*)["']/gi, m3;
  while ((m3 = dlRe.exec(html)) !== null) {
    add(m3[1]);
  }

  console.error('[DFlix] Type:', type, '| Links:', out.length);

  return out;
}

// ─────────────────────────────────────────────
// Deep Crawl Engine
// ─────────────────────────────────────────────

function crawlDeep(url, host, depth = 2) {
  if (depth === 0) return Promise.resolve([]);

  console.error('[Crawl] Visiting:', url);

  return fetchPage(url, UA_MOB)
    .then(function(html) {

      var links = extractLinks(html, host);

      var files = links.filter(function(l) {
        return /\.(mkv|mp4|avi|m3u8)$/i.test(dec(l));
      });

      if (files.length > 0) {
        console.error('[Crawl] Files found:', files.length);
        return files;
      }

      var folders = links.filter(l => l.endsWith('/'));

      return Promise.all(
        folders.slice(0, 5).map(f => crawlDeep(f, host, depth - 1))
      ).then(res => res.flat());
    })
    .catch(err => {
      console.error('[Crawl Error]', err.message);
      return [];
    });
}

// ─────────────────────────────────────────────
// Movie Streams
// ─────────────────────────────────────────────

function getMovieStreams(title, year) {
  var yf   = parseInt(year) <= 1994 ? ep('(1960-1994)') : ep('('+year+')');
  var base = MOVIE_BASE + yf + '/';
  var t    = title + ' (' + year + ')';

  return crawlDeep(base, MOVIE_HOST, 2)
    .then(function(files) {

      var out = [];

      files.forEach(function(file) {
        var name = dec(file);

        if (titleScore(name, title) < 0.5) return;

        var q = 'HD';
        if (/1080p/i.test(name)) q = '1080p';
        else if (/720p/i.test(name)) q = '720p';

        out.push({
          name: 'DhakaFlix ' + q,
          title: t,
          url: file,
          quality: 'BDIX',
          headers: { 'User-Agent': UA_MOB }
        });
      });

      console.error('[Final Streams]', out.length);

      return out;
    });
}

// ─────────────────────────────────────────────
// TV Streams (simple but working)
// ─────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var epTag = 'S' + (season<10?'0':'')+season + 'E' + (episode<10?'0':'')+episode;

  return crawlDeep(TV_BASE, TV_HOST, 2)
    .then(function(files) {

      return files.filter(f => new RegExp(epTag, 'i').test(dec(f)))
        .map(f => ({
          name: 'DhakaFlix TV',
          title: title + ' ' + epTag,
          url: f,
          quality: 'BDIX',
          headers: { 'User-Agent': UA_MOB }
        }));
    });
}

// ─────────────────────────────────────────────
// MAIN ENTRY
// ─────────────────────────────────────────────

function getStreams(tmdbId, media) {

  var type    = media?.type || 'movie';
  var season  = parseInt(media?.season || 1);
  var episode = parseInt(media?.episode || 1);

  return fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}`)
    .then(r => r.json())
    .then(function(d) {

      var title = type === 'movie' ? d.title : d.name;
      var year  = (type === 'movie' ? d.release_date : d.first_air_date || '').substring(0,4);

      if (!title || !year) return [];

      return type === 'movie'
        ? getMovieStreams(title, year)
        : getTvStreams(title, season, episode);
    })
    .catch(err => {
      console.error('[Main Error]', err.message);
      return [];
    });
}

module.exports = { getStreams };

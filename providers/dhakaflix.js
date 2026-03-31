// providers/dhakaflix.js
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

function cleanTitle(s) {
  return s.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchText(url) {
  console.log('[DhakaFlix] Fetching:', url);
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
}

function buildUrl(base, path) {
  if (!base.endsWith('/')) base += '/';
  if (path.startsWith('/')) path = path.slice(1);
  return new URL(path, base).href;
}

function qualLabel(f) {
  if (/1080p/i.test(f)) return '1080p';
  if (/720p/i.test(f))  return '720p';
  return 'SD';
}

// -------------------------------------------------------------------------
// MOVIE: find any year folder containing the movie folder
// -------------------------------------------------------------------------
async function getMovieStreams(title, year) {
  // Get all year folders (including combined ranges like (1960-1994))
  const yearItems = await fetchText(MOVIE_BASE).then(parseDir);
  const cleanedTitle = cleanTitle(title);

  for (const yFolder of yearItems) {
    const yearUrl = buildUrl(MOVIE_BASE, yFolder);
    const movies = await fetchText(yearUrl).then(parseDir);
    for (const mFolder of movies) {
      const folderName = decode(mFolder);
      // remove year, quality, extras from folder name for matching
      const cleanedFolder = cleanTitle(folderName.replace(/\(\d{4}.*?\)/, '').replace(/\d{3,4}p.*/i, ''));
      if (cleanedFolder.includes(cleanedTitle) || cleanedTitle.includes(cleanedFolder)) {
        const movieUrl = buildUrl(yearUrl, mFolder);
        const files = await fetchText(movieUrl).then(html => parseDir(html).filter(f => /\.(mkv|mp4|avi)$/i.test(f)));
        if (files.length) {
          return files.map(f => ({
            name: `DhakaFlix ${qualLabel(f)}`,
            title: `${title} (${year})`,
            url: buildUrl(movieUrl, f),
            quality: 'BDIX',
            headers: { 'User-Agent': UA }
          }));
        }
      }
    }
  }
  console.error(`[Movie] No match for ${title} (${year})`);
  return [];
}

// -------------------------------------------------------------------------
// TV: find show, season, episode
// -------------------------------------------------------------------------
async function getTvStreams(title, season, episode) {
  const cleanedTitle = cleanTitle(title);
  const c = title.trim().charAt(0).toUpperCase();
  const range = TV_RANGES.find(r => r.test(c)) || TV_RANGES[1];
  const rangeUrl = buildUrl(TV_BASE, range.path);

  const shows = await fetchText(rangeUrl).then(parseDir);
  let showUrl = null;
  for (const s of shows) {
    const showName = decode(s);
    const cleanedShow = cleanTitle(showName.replace(/\(TV\s+Series.*\)/, '').replace(/\d{3,4}p.*/i, ''));
    if (cleanedShow.includes(cleanedTitle) || cleanedTitle.includes(cleanedShow)) {
      showUrl = buildUrl(rangeUrl, s);
      break;
    }
  }
  if (!showUrl) throw new Error('Show not found');

  const seasonItems = await fetchText(showUrl).then(parseDir);
  const seasonPat = new RegExp(`^season\\s*0*${season}$`, 'i');
  const seasonFolder = seasonItems.find(s => seasonPat.test(decode(s).trim()));
  if (!seasonFolder) throw new Error(`Season ${season} not found`);

  const seasonUrl = buildUrl(showUrl, seasonFolder);
  const files = await fetchText(seasonUrl).then(html => parseDir(html).filter(f => /\.(mkv|mp4|avi)$/i.test(f)));
  const epPat = new RegExp(`[Ss]0*${season}[Ee]0*${episode}|episode\\s*0*${episode}`, 'i');
  const epFile = files.find(f => epPat.test(decode(f)));
  if (!epFile) throw new Error(`Episode ${episode} not found`);

  const fileUrl = buildUrl(seasonUrl, epFile);
  return [{
    name: 'DhakaFlix TV',
    title: `${title} S${season}E${episode}`,
    url: fileUrl,
    quality: 'HD',
    headers: { 'User-Agent': UA }
  }];
}

// -------------------------------------------------------------------------
// ENTRY
// -------------------------------------------------------------------------
async function getStreams(tmdbId, media) {
  const isMovie = media?.type === 'movie';
  const tmdbUrl = isMovie
    ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`
    : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`;

  try {
    const data = await fetch(tmdbUrl).then(r => r.json());
    const title = isMovie ? (data.title || data.original_title) : (data.name || data.original_name);
    const year = isMovie ? (data.release_date || '').substring(0,4) : (data.first_air_date || '').substring(0,4);
    if (!title) return [];

    if (isMovie) return await getMovieStreams(title, year);
    else return await getTvStreams(title, media.season || 1, media.episode || 1);
  } catch (e) {
    console.error('[DhakaFlix]', e);
    return [];
  }
}

module.exports = { getStreams };

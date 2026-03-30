// providers/dakaflix.js – with detailed logging
var M_HOST = 'http://172.16.50.7';
var TV_HOST = 'http://172.16.50.12';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

var MOVIE_FOLDERS = [
  '/DHAKA-FLIX-7/English%20Movies/',
  '/DHAKA-FLIX-7/English%20Movies%20(1080p)/',
  '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Korean%20Language/',
  '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Japanese%20Language/',
  '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Chinese%20Language/',
  '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Bangla%20Dubbing%20Movies/',
  '/DHAKA-FLIX-7/Foreign%20Language%20Movies/Pakistani%20Movie/',
  '/DHAKA-FLIX-7/Kolkata%20Bangla%20Movies/',
  '/DHAKA-FLIX-7/3D%20Movies/'
];

function getTvFolder(title) {
  var c = title.trim().charAt(0).toUpperCase();
  if (c >= '0' && c <= '9') return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%98%85%200%20%E2%80%94%209/';
  if (c >= 'A' && c <= 'L') return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/';
  if (c >= 'M' && c <= 'R') return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/';
  return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/';
}

function fetchHtml(url) {
  console.log('[DEBUG] Fetching:', url);
  return fetch(url, { headers: { 'User-Agent': UA } }).then(r => r.text());
}

function getHrefs(html) {
  var results = [];
  var re = /href="([^"?#][^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === '/') continue;
    results.push(h);
  }
  return results;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getYearSubfolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

function toUrl(host, href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return host + (href.startsWith('/') ? href : '/' + href);
}

function findMatch(hrefs, normTitle, year) {
  console.log('[DEBUG] Searching in hrefs:', hrefs);
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var norm = normalize(dec);
    if (norm.includes(normTitle) && dec.includes(year)) {
      console.log('[DEBUG] Found match (title+year):', hrefs[i]);
      return hrefs[i];
    }
  }
  for (var j = 0; j < hrefs.length; j++) {
    var dec2 = decodeURIComponent(hrefs[j]);
    if (normalize(dec2).includes(normTitle)) {
      console.log('[DEBUG] Found match (title only):', hrefs[j]);
      return hrefs[j];
    }
  }
  console.log('[DEBUG] No match found');
  return null;
}

function findVideo(hrefs) {
  var exts = ['.mkv', '.mp4', '.avi'];
  for (var i = 0; i < hrefs.length; i++) {
    var lower = hrefs[i].toLowerCase();
    if (exts.some(ext => lower.includes(ext))) {
      console.log('[DEBUG] Found video:', hrefs[i]);
      return hrefs[i];
    }
  }
  console.log('[DEBUG] No video found');
  return null;
}

function searchInFolder(host, folderPath, normTitle, year) {
  var url = host + folderPath;
  var hasYearSub = folderPath.includes('English%20Movies');
  var listUrl = hasYearSub ? url + encodeURIComponent(getYearSubfolder(year)) + '/' : url;
  console.log('[DEBUG] Checking folder:', listUrl);
  return fetchHtml(listUrl).then(html => {
    var hrefs = getHrefs(html);
    var matched = findMatch(hrefs, normTitle, year);
    if (!matched) return null;
    return { host, href: matched };
  }).catch(err => {
    console.error('[DEBUG] Fetch failed for', listUrl, err);
    return null;
  });
}

function getVideoFromFolder(host, folderHref) {
  var folderUrl = toUrl(host, folderHref);
  if (!folderUrl.endsWith('/')) folderUrl += '/';
  console.log('[DEBUG] Getting video from:', folderUrl);
  return fetchHtml(folderUrl).then(html => {
    var hrefs = getHrefs(html);
    var videoHref = findVideo(hrefs);
    return videoHref ? toUrl(host, videoHref) : null;
  }).catch(err => {
    console.error('[DEBUG] Fetch failed for', folderUrl, err);
    return null;
  });
}

function findSeasonFolder(hrefs, season) {
  var seasonNum = parseInt(season);
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    if (!hrefs[i].endsWith('/')) continue;
    var match = dec.match(/season\s*(\d+)/i);
    if (match && parseInt(match[1]) === seasonNum) return hrefs[i];
    if (/^\d+\/$/.test(dec) && parseInt(dec) === seasonNum) return hrefs[i];
  }
  return null;
}

function findEpisodeFile(hrefs, episode) {
  var episodeNum = parseInt(episode);
  var patterns = [
    new RegExp(`s\\d+e${episodeNum < 10 ? '0' + episodeNum : episodeNum}`, 'i'),
    new RegExp(`e${episodeNum < 10 ? '0' + episodeNum : episodeNum}`, 'i'),
    new RegExp(`\\b${episodeNum}\\b`),
    new RegExp(`episode\\s*${episodeNum}`, 'i')
  ];
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var lower = dec.toLowerCase();
    if (patterns.some(p => p.test(lower))) return hrefs[i];
  }
  return null;
}

function getTvStreamUrl(host, showHref, season, episode) {
  var showUrl = toUrl(host, showHref);
  if (!showUrl.endsWith('/')) showUrl += '/';
  console.log('[DEBUG] TV show folder:', showUrl);
  return fetchHtml(showUrl).then(html => {
    var hrefs = getHrefs(html);
    var seasonFolder = findSeasonFolder(hrefs, season);
    if (!seasonFolder) {
      console.log('[DEBUG] No season folder found');
      return null;
    }
    console.log('[DEBUG] Season folder:', seasonFolder);
    var seasonUrl = toUrl(host, seasonFolder);
    if (!seasonUrl.endsWith('/')) seasonUrl += '/';
    return fetchHtml(seasonUrl).then(seasonHtml => {
      var seasonHrefs = getHrefs(seasonHtml);
      var episodeFile = findEpisodeFile(seasonHrefs, episode);
      return episodeFile ? toUrl(host, episodeFile) : null;
    });
  }).catch(err => {
    console.error('[DEBUG] TV fetch error:', err);
    return null;
  });
}

function searchAllFolders(folders, host, normTitle, year, index) {
  if (index >= folders.length) return Promise.resolve(null);
  return searchInFolder(host, folders[index], normTitle, year).then(result => {
    if (result) return result;
    return searchAllFolders(folders, host, normTitle, year, index + 1);
  });
}

function getStreams(tmdbId, media) {
  var title = media && media.title;
  var year = media && media.year;
  var type = media && media.type === 'tv' ? 'tv' : 'movie';
  var season = media && media.season ? parseInt(media.season) : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  console.log('[DEBUG] getStreams called with:', { tmdbId, media, title, year, type });

  if (!title || !year) {
    console.error('[DhakaFlix] Missing title or year in media object');
    return Promise.resolve([]);
  }

  var normTitle = normalize(title);
  var label = isMovie
    ? `${title} (${year})`
    : `${title} S${season < 10 ? '0' + season : season}E${episode < 10 ? '0' + episode : episode}`;

  console.log('[DEBUG] Searching for:', { title, year, normTitle, label });

  var searchPromise;
  if (isMovie) {
    searchPromise = searchAllFolders(MOVIE_FOLDERS, M_HOST, normTitle, year, 0);
  } else {
    var tvFolder = getTvFolder(title);
    console.log('[DEBUG] TV folder base:', tvFolder);
    searchPromise = searchInFolder(TV_HOST, tvFolder, normTitle, year);
  }

  return searchPromise.then(result => {
    if (!result) {
      console.log('[DEBUG] No folder found for', title);
      return [];
    }
    console.log('[DEBUG] Found folder:', result);
    if (isMovie) {
      return getVideoFromFolder(result.host, result.href).then(streamUrl => {
        if (!streamUrl) {
          console.log('[DEBUG] No video found in folder');
          return [];
        }
        console.log('[DEBUG] Final stream URL:', streamUrl);
        return [{
          name: 'DhakaFlix',
          title: label,
          url: streamUrl,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        }];
      });
    } else {
      return getTvStreamUrl(result.host, result.href, season, episode).then(streamUrl => {
        if (!streamUrl) return [];
        return [{
          name: 'DhakaFlix',
          title: label,
          url: streamUrl,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        }];
      });
    }
  }).catch(e => {
    console.error('[DhakaFlix] Error:', e.message, e);
    return [];
  });
}

module.exports = { getStreams };  var m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === '/') continue;
    results.push(h);
  }
  return results;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getYearSubfolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

function toUrl(host, href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return host + (href.startsWith('/') ? href : '/' + href);
}

function findMatch(hrefs, normTitle, year) {
  // First try: title + year
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var norm = normalize(dec);
    if (norm.includes(normTitle) && dec.includes(year)) return hrefs[i];
  }
  // Second try: title only
  for (var j = 0; j < hrefs.length; j++) {
    var dec2 = decodeURIComponent(hrefs[j]);
    if (normalize(dec2).includes(normTitle)) return hrefs[j];
  }
  return null;
}

function findVideo(hrefs) {
  var exts = ['.mkv', '.mp4', '.avi'];
  for (var i = 0; i < hrefs.length; i++) {
    var lower = hrefs[i].toLowerCase();
    if (exts.some(ext => lower.includes(ext))) return hrefs[i];
  }
  return null;
}

function searchInFolder(host, folderPath, normTitle, year) {
  var url = host + folderPath;
  var hasYearSub = folderPath.includes('English%20Movies');
  var listUrl = hasYearSub ? url + encodeURIComponent(getYearSubfolder(year)) + '/' : url;
  return fetchHtml(listUrl).then(html => {
    var hrefs = getHrefs(html);
    var matched = findMatch(hrefs, normTitle, year);
    if (!matched) return null;
    return { host, href: matched };
  }).catch(() => null);
}

function getVideoFromFolder(host, folderHref) {
  var folderUrl = toUrl(host, folderHref);
  if (!folderUrl.endsWith('/')) folderUrl += '/';
  return fetchHtml(folderUrl).then(html => {
    var hrefs = getHrefs(html);
    var videoHref = findVideo(hrefs);
    return videoHref ? toUrl(host, videoHref) : null;
  }).catch(() => null);
}

// TV helpers
function findSeasonFolder(hrefs, season) {
  var seasonNum = parseInt(season);
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    if (!hrefs[i].endsWith('/')) continue;
    var match = dec.match(/season\s*(\d+)/i);
    if (match && parseInt(match[1]) === seasonNum) return hrefs[i];
    if (/^\d+\/$/.test(dec) && parseInt(dec) === seasonNum) return hrefs[i];
  }
  return null;
}

function findEpisodeFile(hrefs, episode) {
  var episodeNum = parseInt(episode);
  var patterns = [
    new RegExp(`s\\d+e${episodeNum < 10 ? '0' + episodeNum : episodeNum}`, 'i'),
    new RegExp(`e${episodeNum < 10 ? '0' + episodeNum : episodeNum}`, 'i'),
    new RegExp(`\\b${episodeNum}\\b`),
    new RegExp(`episode\\s*${episodeNum}`, 'i')
  ];
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var lower = dec.toLowerCase();
    if (patterns.some(p => p.test(lower))) return hrefs[i];
  }
  return null;
}

function getTvStreamUrl(host, showHref, season, episode) {
  var showUrl = toUrl(host, showHref);
  if (!showUrl.endsWith('/')) showUrl += '/';
  return fetchHtml(showUrl).then(html => {
    var hrefs = getHrefs(html);
    var seasonFolder = findSeasonFolder(hrefs, season);
    if (!seasonFolder) return null;
    var seasonUrl = toUrl(host, seasonFolder);
    if (!seasonUrl.endsWith('/')) seasonUrl += '/';
    return fetchHtml(seasonUrl).then(seasonHtml => {
      var seasonHrefs = getHrefs(seasonHtml);
      var episodeFile = findEpisodeFile(seasonHrefs, episode);
      return episodeFile ? toUrl(host, episodeFile) : null;
    });
  }).catch(() => null);
}

function searchAllFolders(folders, host, normTitle, year, index) {
  if (index >= folders.length) return Promise.resolve(null);
  return searchInFolder(host, folders[index], normTitle, year).then(result => {
    if (result) return result;
    return searchAllFolders(folders, host, normTitle, year, index + 1);
  });
}

function getStreams(tmdbId, media) {
  // Use title and year from media object (provided by the app)
  var title = media && media.title;
  var year = media && media.year;
  var type = media && media.type === 'tv' ? 'tv' : 'movie';
  var season = media && media.season ? parseInt(media.season) : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  if (!title || !year) {
    console.error('[DhakaFlix] Missing title or year in media object');
    return Promise.resolve([]);
  }

  var normTitle = normalize(title);
  var label = isMovie
    ? `${title} (${year})`
    : `${title} S${season < 10 ? '0' + season : season}E${episode < 10 ? '0' + episode : episode}`;

  var searchPromise;
  if (isMovie) {
    searchPromise = searchAllFolders(MOVIE_FOLDERS, M_HOST, normTitle, year, 0);
  } else {
    var tvFolder = getTvFolder(title);
    searchPromise = searchInFolder(TV_HOST, tvFolder, normTitle, year);
  }

  return searchPromise.then(result => {
    if (!result) return [];
    if (isMovie) {
      return getVideoFromFolder(result.host, result.href).then(streamUrl => {
        if (!streamUrl) return [];
        return [{
          name: 'DhakaFlix',
          title: label,
          url: streamUrl,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        }];
      });
    } else {
      return getTvStreamUrl(result.host, result.href, season, episode).then(streamUrl => {
        if (!streamUrl) return [];
        return [{
          name: 'DhakaFlix',
          title: label,
          url: streamUrl,
          quality: 'BDIX',
          headers: { 'User-Agent': UA }
        }];
      });
    }
  }).catch(e => {
    console.error('[DhakaFlix] Error:', e.message);
    return [];
  });
}

module.exports = { getStreams };
// Helper: fetch with User-Agent
function fetchHtml(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) { return r.text(); });
}

// Extract all hrefs from an Apache directory listing
function getHrefs(html) {
  var results = [];
  var re = /href="([^"?#][^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h === '../' || h === '/') continue;
    results.push(h);
  }
  return results;
}

// Normalize a string for matching (remove non-alphanumeric)
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Determine the year subfolder name (e.g., (1960-1994) or (2023))
function getYearSubfolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

// Build a full URL from host and href
function toUrl(host, href) {
  if (!href) return null;
  if (href.indexOf('http') === 0) return href;
  if (href.charAt(0) === '/') return host + href;
  return host + '/' + href;
}

// Find a folder that matches the movie title (and optionally year)
function findMatch(hrefs, normTitle, year) {
  // Pass 1: title + year
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var norm = normalize(dec);
    if (norm.indexOf(normTitle) !== -1 && dec.indexOf(year) !== -1) return hrefs[i];
  }
  // Pass 2: title only
  for (var j = 0; j < hrefs.length; j++) {
    var dec2 = decodeURIComponent(hrefs[j]);
    if (normalize(dec2).indexOf(normTitle) !== -1) return hrefs[j];
  }
  return null;
}

// Find a video file inside a folder (mkv, mp4, avi)
function findVideo(hrefs) {
  var exts = ['.mkv', '.mp4', '.avi'];
  for (var i = 0; i < hrefs.length; i++) {
    var lower = hrefs[i].toLowerCase();
    for (var j = 0; j < exts.length; j++) {
      if (lower.indexOf(exts[j]) !== -1) return hrefs[i];
    }
  }
  return null;
}

// Search for a movie inside a given folder path (with optional year subfolder)
function searchInFolder(host, folderPath, normTitle, year) {
  var url = host + folderPath;
  var hasYearSub = folderPath.indexOf('English%20Movies') !== -1 || folderPath.indexOf('English%20Movies%20(1080p)') !== -1;

  var listUrl = hasYearSub
    ? url + encodeURIComponent(getYearSubfolder(year)) + '/'
    : url;

  return fetchHtml(listUrl).then(function(html) {
    var hrefs = getHrefs(html);
    var matched = findMatch(hrefs, normTitle, year);
    if (!matched) {
      // For English movies, fallback to root folder only if it might contain the movie directly
      // (but as per structure, root only has year folders, so we skip)
      if (hasYearSub) {
        return null;
      }
      return null;
    }
    return { host: host, href: matched };
  }).catch(function() { return null; });
}

// Get video URL from a folder (for movies)
function getVideoFromFolder(host, folderHref) {
  var folderUrl = toUrl(host, folderHref);
  if (folderUrl.charAt(folderUrl.length - 1) !== '/') folderUrl += '/';
  return fetchHtml(folderUrl).then(function(html) {
    var hrefs = getHrefs(html);
    var videoHref = findVideo(hrefs);
    if (!videoHref) return null;
    return toUrl(host, videoHref);
  }).catch(function() { return null; });
}

// TV show helpers
function findSeasonFolder(hrefs, season) {
  var seasonNum = parseInt(season);
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    // Must be a folder (ends with '/')
    if (hrefs[i].slice(-1) !== '/') continue;
    // Match "Season 1", "Season 01", "Season 1 (2024)", or just "1/"
    var match = dec.match(/season\s*(\d+)/i);
    if (match && parseInt(match[1]) === seasonNum) return hrefs[i];
    if (/^\d+\/$/.test(dec) && parseInt(dec) === seasonNum) return hrefs[i];
  }
  return null;
}

function findEpisodeFile(hrefs, episode) {
  var episodeNum = parseInt(episode);
  // Patterns: S01E01, E01, 01, or "Episode 1"
  var patterns = [
    new RegExp('s\\d+e' + (episodeNum < 10 ? '0' + episodeNum : episodeNum), 'i'),
    new RegExp('e' + (episodeNum < 10 ? '0' + episodeNum : episodeNum), 'i'),
    new RegExp('\\b' + episodeNum + '\\b'),
    new RegExp('episode\\s*' + episodeNum, 'i')
  ];
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var lower = dec.toLowerCase();
    for (var p = 0; p < patterns.length; p++) {
      if (patterns[p].test(lower)) return hrefs[i];
    }
  }
  return null;
}

function getTvStreamUrl(host, showHref, season, episode) {
  var showUrl = toUrl(host, showHref);
  if (showUrl.charAt(showUrl.length - 1) !== '/') showUrl += '/';
  return fetchHtml(showUrl)
    .then(function(html) {
      var hrefs = getHrefs(html);
      var seasonFolder = findSeasonFolder(hrefs, season);
      if (!seasonFolder) return null;
      var seasonUrl = toUrl(host, seasonFolder);
      if (seasonUrl.charAt(seasonUrl.length - 1) !== '/') seasonUrl += '/';
      return fetchHtml(seasonUrl).then(function(seasonHtml) {
        var seasonHrefs = getHrefs(seasonHtml);
        var episodeFile = findEpisodeFile(seasonHrefs, episode);
        if (!episodeFile) return null;
        return toUrl(host, episodeFile);
      });
    })
    .catch(function() { return null; });
}

// Recursively search all movie folders
function searchAllFolders(folders, host, normTitle, year, index) {
  if (index >= folders.length) return Promise.resolve(null);
  return searchInFolder(host, folders[index], normTitle, year).then(function(result) {
    if (result) return result;
    return searchAllFolders(folders, host, normTitle, year, index + 1);
  });
}

// Main exported function
function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  var season = media && media.season ? parseInt(media.season) : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY
    : 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title = isMovie ? data.title : data.name;
      var year = ((isMovie ? data.release_date : data.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];

      var normTitle = normalize(title);
      var label = isMovie
        ? title + ' (' + year + ')'
        : title + ' S' + (season < 10 ? '0' + season : '' + season) + 'E' + (episode < 10 ? '0' + episode : '' + episode);

      var searchPromise;
      if (isMovie) {
        searchPromise = searchAllFolders(MOVIE_FOLDERS, M_HOST, normTitle, year, 0);
      } else {
        var tvFolder = getTvFolder(title);
        searchPromise = searchInFolder(TV_HOST, tvFolder, normTitle, year);
      }

      return searchPromise.then(function(result) {
        if (!result) return [];
        if (isMovie) {
          return getVideoFromFolder(result.host, result.href).then(function(streamUrl) {
            if (!streamUrl) return [];
            return [{
              name: 'DhakaFlix',
              title: label,
              url: streamUrl,
              quality: 'BDIX',
              headers: { 'User-Agent': UA }
            }];
          });
        } else {
          return getTvStreamUrl(result.host, result.href, season, episode).then(function(streamUrl) {
            if (!streamUrl) return [];
            return [{
              name: 'DhakaFlix',
              title: label,
              url: streamUrl,
              quality: 'BDIX',
              headers: { 'User-Agent': UA }
            }];
          });
        }
      });
    })
    .catch(function(e) {
      console.error('[DhakaFlix] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

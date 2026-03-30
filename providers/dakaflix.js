// providers/dakaflix.js
// DhakaFlix BDIX - Full provider (Movies + TV)

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var M_HOST = 'http://172.16.50.7';
var TV_HOST = 'http://172.16.50.12';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// All movie folders on server 7
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

// TV folders on server 12
function getTvFolder(title) {
  var c = title.trim().charAt(0).toUpperCase();
  if (c >= '0' && c <= '9') return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%98%85%200%20%E2%80%94%209/';
  if (c >= 'A' && c <= 'L') return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/';
  if (c >= 'M' && c <= 'R') return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/';
  return '/DHAKA-FLIX-12/TV-WEB-Series/TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/';
}

function fetchHtml(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) { return r.text(); });
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
  if (href.indexOf('http') === 0) return href;
  if (href.charAt(0) === '/') return host + href;
  return host + '/' + href;
}

function findMatch(hrefs, normTitle, year) {
  // pass 1: title + year
  for (var i = 0; i < hrefs.length; i++) {
    var dec = decodeURIComponent(hrefs[i]);
    var norm = normalize(dec);
    if (norm.indexOf(normTitle) !== -1 && dec.indexOf(year) !== -1) return hrefs[i];
  }
  // pass 2: title only
  for (var j = 0; j < hrefs.length; j++) {
    var dec2 = decodeURIComponent(hrefs[j]);
    if (normalize(dec2).indexOf(normTitle) !== -1) return hrefs[j];
  }
  return null;
}

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

function searchInFolder(host, folderPath, normTitle, year) {
  var url = host + folderPath;
  // For English Movies, try year subfolder first
  var hasYearSub = folderPath.indexOf('English%20Movies') !== -1;

  var listUrl = hasYearSub
    ? url + encodeURIComponent(getYearSubfolder(year)) + '/'
    : url;

  return fetchHtml(listUrl).then(function(html) {
    var hrefs = getHrefs(html);
    var matched = findMatch(hrefs, normTitle, year);
    if (!matched) {
      // fallback: try root of folder without year subfolder
      if (hasYearSub) {
        return fetchHtml(url).then(function(html2) {
          var hrefs2 = getHrefs(html2);
          var matched2 = findMatch(hrefs2, normTitle, year);
          if (!matched2) return null;
          return { host: host, href: matched2 };
        });
      }
      return null;
    }
    return { host: host, href: matched };
  }).catch(function() { return null; });
}

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

function searchAllFolders(folders, host, normTitle, year, index) {
  if (index >= folders.length) return Promise.resolve(null);
  return searchInFolder(host, folders[index], normTitle, year).then(function(result) {
    if (result) return result;
    return searchAllFolders(folders, host, normTitle, year, index + 1);
  });
}

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
      });
    })
    .catch(function(e) {
      console.error('[DhakaFlix] Error: ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

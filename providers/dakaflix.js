// providers/dakaflix.js
// DhakaFlix BDIX provider for Nuvio

var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var MOVIE_HOST = 'http://172.16.50.7';
var TV_HOST = 'http://172.16.50.12';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function fetchHtml(url) {
  return fetch(url, { headers: { 'User-Agent': UA } }).then(function(r) { return r.text(); });
}

function toFullUrl(host, href) {
  if (!href) return null;
  if (href.indexOf('http') === 0) return href;
  if (href.charAt(0) === '/') return host + href;
  return href;
}

function getLinks(html) {
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

function getYearFolder(year) {
  return parseInt(year) <= 1994 ? '(1960-1994)' : '(' + year + ')';
}

function getTvFolder(title) {
  var c = title.trim().charAt(0).toUpperCase();
  if (c >= '0' && c <= '9') return 'TV Series \u2605 0 \u2014 9';
  if (c >= 'A' && c <= 'L') return 'TV Series \u2665 A \u2014 L';
  if (c >= 'M' && c <= 'R') return 'TV Series \u2666 M \u2014 R';
  return 'TV Series \u2666 S \u2014 Z';
}

function findMatchHref(links, normTitle, year) {
  // pass 1: title + year
  for (var i = 0; i < links.length; i++) {
    var dec = decodeURIComponent(links[i]);
    var norm = normalize(dec);
    if (norm.indexOf(normTitle) !== -1 && dec.indexOf(year) !== -1) return links[i];
  }
  // pass 2: title only
  for (var j = 0; j < links.length; j++) {
    var dec2 = decodeURIComponent(links[j]);
    var norm2 = normalize(dec2);
    if (norm2.indexOf(normTitle) !== -1) return links[j];
  }
  return null;
}

function findVideoHref(links) {
  var exts = ['.mkv', '.mp4', '.avi'];
  for (var i = 0; i < links.length; i++) {
    var lower = links[i].toLowerCase();
    for (var j = 0; j < exts.length; j++) {
      if (lower.indexOf(exts[j]) !== -1) return links[i];
    }
  }
  return null;
}

function getStreams(tmdbId, media) {
  var type = media && media.type ? media.type : 'movie';
  var season = media && media.season ? parseInt(media.season) : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMovie = type === 'movie';
  var host = isMovie ? MOVIE_HOST : TV_HOST;

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

      var listingUrl = isMovie
        ? MOVIE_HOST + '/DHAKA-FLIX-7/English%20Movies/' + encodeURIComponent(getYearFolder(year)) + '/'
        : TV_HOST + '/DHAKA-FLIX-12/TV-WEB-Series/' + encodeURIComponent(getTvFolder(title)) + '/';

      console.log('[DhakaFlix] Listing: ' + listingUrl);

      return fetchHtml(listingUrl).then(function(html) {
        var links = getLinks(html);
        console.log('[DhakaFlix] Found ' + links.length + ' links in listing');

        var matchedHref = findMatchHref(links, normTitle, year);
        if (!matchedHref) {
          console.error('[DhakaFlix] No match for: ' + title + ' ' + year);
          return [];
        }

        var folderUrl = toFullUrl(host, matchedHref);
        if (folderUrl.charAt(folderUrl.length - 1) !== '/') folderUrl += '/';
        console.log('[DhakaFlix] Folder: ' + folderUrl);

        return fetchHtml(folderUrl).then(function(html2) {
          var links2 = getLinks(html2);
          var videoHref = findVideoHref(links2);
          if (!videoHref) {
            console.error('[DhakaFlix] No video in folder');
            return [];
          }

          var streamUrl = toFullUrl(host, videoHref);
          console.log('[DhakaFlix] Stream: ' + streamUrl);

          var label = isMovie
            ? title + ' (' + year + ')'
            : title + ' S' + (season < 10 ? '0' + season : '' + season) + 'E' + (episode < 10 ? '0' + episode : '' + episode);

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

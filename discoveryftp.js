// ============================================================
//  DiscoveryFTP Provider for Nuvio
//  Fetches movies from dflix.discoveryftp.net/m
// ============================================================

// ---- EDIT THESE TWO LINES -----------------------------------
var BASE_URL = "https://dflix.discoveryftp.net/m/";   // must end with /
var QUALITY_FOLDERS = [
  "1080P%20WEB-DL/",
  "720P%20WEB-DL/",
  // add or remove based on what you see in the browser
];
// -------------------------------------------------------------

var VIDEO_EXTS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv"];

function isVideo(name) {
  var lower = (name || "").toLowerCase();
  for (var i = 0; i < VIDEO_EXTS.length; i++) {
    if (lower.slice(-VIDEO_EXTS[i].length) === VIDEO_EXTS[i]) return true;
  }
  return false;
}

function parseLinks(html) {
  var links = [];
  var re = /href="([^"?#][^"]*)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var href = m[1];
    if (href === "./" || href === "../" || href.charAt(0) === "/") continue;
    var name = decodeURIComponent(href.replace(/\/$/, "").replace(/\+/g, " "));
    links.push({ name: name, href: href });
  }
  return links;
}

function fetchDir(url) {
  return fetch(url)
    .then(function(r) { return r.text(); })
    .then(function(html) { return parseLinks(html); })
    .catch(function() { return []; });
}

function cleanMovieName(folderName) {
  // Remove year if present at the end (e.g., "Saiyaara 2025" -> "Saiyaara")
  return folderName.replace(/\s+\d{4}$/, "").trim();
}

function matchScore(folderName, title) {
  var a = cleanMovieName(folderName).toLowerCase().replace(/[^a-z0-9]/g, "");
  var b = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.indexOf(b) !== -1) return 0.9;
  if (b.indexOf(a) !== -1) return 0.85;
  var words = b.split(" ").filter(Boolean);
  var hits = words.filter(function(w) { return a.indexOf(w) !== -1; });
  return hits.length / words.length * 0.7;
}

function getMovieInfo(tmdbId) {
  var apiKey = "4ef0d7355d9ffb5151e987764708ce96";
  var url = "https://api.themoviedb.org/3/movie/" + tmdbId
    + "?api_key=" + apiKey + "&language=en-US";
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.release_date ? parseInt(d.release_date.split("-")[0]) : null;
      return { title: d.title || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

function searchQualityFolder(qualityUrl, title, year) {
  return fetchDir(qualityUrl).then(function(movieFolders) {
    var best = null, bestScore = 0;
    movieFolders.forEach(function(folder) {
      var score = matchScore(folder.name, title);
      if (year && folder.name.includes(String(year))) score += 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = folder;
      }
    });
    if (!best || bestScore < 0.55) return null;

    var movieUrl = qualityUrl + best.href;
    if (movieUrl.slice(-1) !== "/") movieUrl += "/";

    return fetchDir(movieUrl).then(function(files) {
      var video = null;
      for (var i = 0; i < files.length; i++) {
        if (isVideo(files[i].name)) {
          video = files[i];
          break;
        }
      }
      if (!video) return null;

      var quality = qualityUrl.includes("1080P") ? "1080p"
                   : qualityUrl.includes("720P") ? "720p"
                   : qualityUrl.includes("4K") ? "4K"
                   : "SD";

      return {
        url:     movieUrl + encodeURIComponent(video.name),
        quality: quality,
        label:   "DiscoveryFTP"
      };
    });
  }).catch(function() { return null; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== "movie") return Promise.resolve([]);

  return getMovieInfo(tmdbId).then(function(info) {
    if (!info.title) return [];

    var searches = QUALITY_FOLDERS.map(function(qualityFolder) {
      var qualityUrl = BASE_URL + qualityFolder;
      return searchQualityFolder(qualityUrl, info.title, info.year)
        .then(function(result) {
          if (!result) return null;
          return {
            url:      result.url,
            quality:  result.quality,
            title:    "DiscoveryFTP · " + result.quality,
            provider: "DiscoveryFTP"
          };
        })
        .catch(function() { return null; });
    });

    return Promise.all(searches).then(function(results) {
      return results.filter(function(r) { return r !== null; });
    });
  });
}

module.exports = { getStreams: getStreams };

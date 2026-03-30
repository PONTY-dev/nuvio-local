// ============================================================
//  DhakaFlix Unified Provider for Nuvio
//  Uses the same JSON search API as the Kotlin CloudStream plugin
//  Supports servers: 7, 9, 12, 14 (movies + TV series)
// ============================================================

var TMDB_API_KEY = "4ef0d7355d9ffb5151e987764708ce96";

// Server configurations – edit if your IPs or folder names differ
var SERVERS = [
  { base: "http://172.16.50.7",  root: "/DHAKA-FLIX-7/",  name: "7",  movieOnly: true },
  { base: "http://172.16.50.9",  root: "/DHAKA-FLIX-9/",  name: "9",  tvOnly: true },
  { base: "http://172.16.50.12", root: "/DHAKA-FLIX-12/", name: "12", tvOnly: true },
  { base: "http://172.16.50.14", root: "/DHAKA-FLIX-14/", name: "14", movieAndTv: true }
];

var VIDEO_EXTS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv"];

// ------------------------------------------------------------------
// API: send JSON search to server
// ------------------------------------------------------------------
function searchServer(serverUrl, query) {
  var body = JSON.stringify({
    action: "get",
    search: {
      href: serverUrl,
      pattern: query,
      ignorecase: true
    }
  });
  return fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body
  })
    .then(function(r) { return r.json(); })
    .catch(function() { return null; });
}

function isVideo(name) {
  var lower = (name || "").toLowerCase();
  return VIDEO_EXTS.some(function(ext) { return lower.endsWith(ext); });
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ------------------------------------------------------------------
// TMDB helpers
// ------------------------------------------------------------------
function getMovieInfo(tmdbId) {
  var url = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.release_date ? parseInt(d.release_date.split("-")[0]) : null;
      return { title: d.title || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

function getSeriesInfo(tmdbId) {
  var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.first_air_date ? parseInt(d.first_air_date.split("-")[0]) : null;
      return { title: d.name || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

// ------------------------------------------------------------------
// Movie search (using API)
// ------------------------------------------------------------------
function searchMovieOnServer(server, title, year) {
  var serverUrl = server.base + server.root;
  // First, get all items from the server root via the API
  return searchServer(serverUrl, title).then(function(data) {
    if (!data || !data.search) return null;

    var candidates = [];
    // The API returns a list of items (both files and folders)
    // We're interested in folders (size == null) that might contain the movie
    for (var i = 0; i < data.search.length; i++) {
      var item = data.search[i];
      if (item.size !== null) continue; // skip files, we want folders
      var folderName = decodeURIComponent(item.href.split("/").pop().replace(/\+/g, " "));
      // Check if folder name contains title and year
      var normFolder = normalize(folderName);
      var normTitle = normalize(title);
      var containsTitle = normFolder.indexOf(normTitle) !== -1;
      var containsYear = year && folderName.indexOf("(" + year + ")") !== -1;
      if (containsTitle && containsYear) {
        candidates.push(item);
      }
    }

    if (candidates.length === 0) return null;

    // Sort candidates by size? Not relevant for folders. We'll take the first one.
    var movieFolder = candidates[0];
    var folderUrl = server.base + movieFolder.href;
    // Now fetch contents of that folder
    return fetchDir(folderUrl).then(function(files) {
      var video = files.find(function(f) { return isVideo(f.name); });
      if (!video) return null;
      var quality = detectQuality(video.name);
      return {
        url: folderUrl + encodeURIComponent(video.name),
        quality: quality,
        serverName: server.name
      };
    });
  }).catch(function() { return null; });
}

// ------------------------------------------------------------------
// TV series search (using API for series folder, then navigate)
// ------------------------------------------------------------------
function searchTvEpisodeOnServer(server, title, year, season, episode) {
  var serverUrl = server.base + server.root;
  return searchServer(serverUrl, title).then(function(data) {
    if (!data || !data.search) return null;

    // Find the series folder (size == null)
    var seriesFolder = null;
    for (var i = 0; i < data.search.length; i++) {
      var item = data.search[i];
      if (item.size !== null) continue;
      var folderName = decodeURIComponent(item.href.split("/").pop().replace(/\+/g, " "));
      var normFolder = normalize(folderName);
      var normTitle = normalize(title);
      var containsTitle = normFolder.indexOf(normTitle) !== -1;
      var containsYear = year && folderName.indexOf("(" + year + ")") !== -1;
      if (containsTitle && (containsYear || !year)) {
        seriesFolder = item;
        break;
      }
    }
    if (!seriesFolder) return null;

    var seriesUrl = server.base + seriesFolder.href;
    if (seriesUrl.slice(-1) !== "/") seriesUrl += "/";

    // Get season folder
    return findSeasonFolder(seriesUrl, season).then(function(seasonFolder) {
      if (!seasonFolder) return null;
      var seasonUrl = seriesUrl + seasonFolder.href;
      if (seasonUrl.slice(-1) !== "/") seasonUrl += "/";
      return findEpisodeFile(seasonUrl, season, episode).then(function(epFile) {
        if (!epFile) return null;
        var quality = detectQuality(epFile.name);
        return {
          url: seasonUrl + encodeURIComponent(epFile.name),
          quality: quality,
          serverName: server.name
        };
      });
    });
  }).catch(function() { return null; });
}

// ------------------------------------------------------------------
// Helpers for folder navigation (used in TV search)
// ------------------------------------------------------------------
function fetchDir(url) {
  // Simple GET to get HTML and parse links (for navigating into subfolders)
  return fetch(url)
    .then(function(r) { return r.text(); })
    .then(function(html) {
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
    })
    .catch(function() { return []; });
}

function findSeasonFolder(seriesUrl, seasonNum) {
  return fetchDir(seriesUrl).then(function(items) {
    var seasonStr = "Season " + seasonNum;
    var seasonStrZero = "Season " + (seasonNum < 10 ? "0" + seasonNum : seasonNum);
    var found = items.find(function(i) {
      return i.name === seasonStr || i.name === seasonStrZero;
    });
    return found || null;
  });
}

function findEpisodeFile(seasonUrl, seasonNum, episodeNum) {
  return fetchDir(seasonUrl).then(function(files) {
    var pattern = new RegExp("S" + pad2(seasonNum) + "E" + pad2(episodeNum), "i");
    var found = files.find(function(f) {
      return isVideo(f.name) && pattern.test(f.name);
    });
    return found || null;
  });
}

function pad2(num) {
  return num < 10 ? "0" + num : "" + num;
}

function detectQuality(filename) {
  var lower = filename.toLowerCase();
  if (lower.indexOf("2160") !== -1) return "4K";
  if (lower.indexOf("1080") !== -1) return "1080p";
  if (lower.indexOf("720") !== -1)  return "720p";
  return "SD";
}

// ------------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode) {
  // Movies
  if (mediaType === "movie") {
    return getMovieInfo(tmdbId).then(function(info) {
      if (!info.title) return [];

      var tasks = [];
      for (var s = 0; s < SERVERS.length; s++) {
        var server = SERVERS[s];
        // Only search on servers that have movies (movieOnly or movieAndTv)
        if (server.movieOnly || server.movieAndTv) {
          tasks.push(
            searchMovieOnServer(server, info.title, info.year)
              .then(function(result) {
                if (!result) return null;
                return {
                  url: result.url,
                  quality: result.quality,
                  title: "DhakaFlix (Server " + result.serverName + ") · " + result.quality,
                  provider: "DhakaFlix"
                };
              })
          );
        }
      }

      return Promise.all(tasks).then(function(results) {
        return results.filter(function(r) { return r !== null; });
      });
    });
  }

  // TV Series
  if (mediaType === "series" || mediaType === "tv") {
    if (!season || !episode) return Promise.resolve([]);
    return getSeriesInfo(tmdbId).then(function(info) {
      if (!info.title) return [];

      var tasks = [];
      for (var s = 0; s < SERVERS.length; s++) {
        var server = SERVERS[s];
        // Only search on servers that have TV (tvOnly or movieAndTv)
        if (server.tvOnly || server.movieAndTv) {
          tasks.push(
            searchTvEpisodeOnServer(server, info.title, info.year, season, episode)
              .then(function(result) {
                if (!result) return null;
                return {
                  url: result.url,
                  quality: result.quality,
                  title: "DhakaFlix (Server " + result.serverName + ") · " + result.quality,
                  provider: "DhakaFlix"
                };
              })
          );
        }
      }

      return Promise.all(tasks).then(function(results) {
        return results.filter(function(r) { return r !== null; });
      });
    });
  }

  return Promise.resolve([]);
}

module.exports = { getStreams: getStreams };

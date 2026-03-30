// ============================================================
//  DhakaFlix Unified Provider for Nuvio (HTML‑based)
//  Supports servers 7, 9, 12, 14 – movies + TV series
// ============================================================

var TMDB_API_KEY = "4ef0d7355d9ffb5151e987764708ce96";

// Server configurations – edit if your IPs or folder names differ
var SERVERS = [
  { base: "http://172.16.50.7",  root: "/DHAKA-FLIX-7/",  name: "7",  supportsMovies: true, supportsTv: false },
  { base: "http://172.16.50.9",  root: "/DHAKA-FLIX-9/",  name: "9",  supportsMovies: false, supportsTv: true },
  { base: "http://172.16.50.12", root: "/DHAKA-FLIX-12/", name: "12", supportsMovies: false, supportsTv: true },
  { base: "http://172.16.50.14", root: "/DHAKA-FLIX-14/", name: "14", supportsMovies: true, supportsTv: true }
];

var VIDEO_EXTS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv"];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function isVideo(name) {
  var lower = (name || "").toLowerCase();
  return VIDEO_EXTS.some(function(ext) { return lower.endsWith(ext); });
}

function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
// Fetch directory listing (HTML)
// ------------------------------------------------------------------
function fetchDir(url) {
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
// Movie search – scan year folders, then movie folders
// ------------------------------------------------------------------
function searchMovieOnServer(server, title, year) {
  var baseUrl = server.base + server.root;
  // Step 1: get list of year folders (like "(2025)", "(2024)", etc.)
  return fetchDir(baseUrl).then(function(yearFolders) {
    // Only folders that look like "(2025)" – we can filter
    var candidates = yearFolders.filter(function(f) {
      return f.name.match(/^\(\d{4}\)$/);
    });
    // Move exact year folder to front if present
    var exactYear = candidates.find(function(f) { return f.name === "(" + year + ")"; });
    if (exactYear) {
      candidates = [exactYear].concat(candidates.filter(function(f) { return f !== exactYear; }));
    }

    // Search through each year folder
    var chain = Promise.resolve(null);
    for (var i = 0; i < candidates.length; i++) {
      chain = chain.then(function(prev) {
        if (prev) return prev;
        var yearFolder = candidates[i];
        var yearUrl = baseUrl + yearFolder.href;
        return fetchDir(yearUrl).then(function(movieFolders) {
          // Find a movie folder that matches title and year
          var best = null, bestScore = 0;
          movieFolders.forEach(function(m) {
            var normFolder = normalize(m.name);
            var normTitle = normalize(title);
            var containsTitle = normFolder.indexOf(normTitle) !== -1;
            var containsYear = m.name.indexOf("(" + year + ")") !== -1;
            var score = (containsTitle ? 1 : 0) + (containsYear ? 0.5 : 0);
            if (score > bestScore) {
              bestScore = score;
              best = m;
            }
          });
          if (!best || bestScore < 1.0) return null; // require at least title match
          var movieUrl = yearUrl + best.href;
          if (movieUrl.slice(-1) !== "/") movieUrl += "/";
          return fetchDir(movieUrl).then(function(files) {
            var video = files.find(function(f) { return isVideo(f.name); });
            if (!video) return null;
            var quality = detectQuality(video.name);
            return {
              url: movieUrl + encodeURIComponent(video.name),
              quality: quality,
              serverName: server.name
            };
          });
        });
      });
    }
    return chain;
  }).catch(function() { return null; });
}

// ------------------------------------------------------------------
// TV series search – find series folder (anywhere), then season, episode
// ------------------------------------------------------------------
function findSeriesFolderRecursive(rootUrl, title, year, depth) {
  depth = depth || 0;
  if (depth > 6) return Promise.resolve(null);
  return fetchDir(rootUrl).then(function(items) {
    // Check if current folder matches the series
    var rootName = decodeURIComponent(rootUrl.split("/").pop().replace(/\+/g, " "));
    var normRoot = normalize(rootName);
    var normTitle = normalize(title);
    var containsTitle = normRoot.indexOf(normTitle) !== -1;
    var containsYear = year && rootName.indexOf("(" + year + ")") !== -1;
    if (containsTitle && (containsYear || !year)) {
      return { href: "", name: rootName };
    }
    // Otherwise, search subfolders
    var folders = items.filter(function(i) { return i.href.endsWith("/"); });
    var tasks = folders.map(function(folder) {
      var nextUrl = rootUrl + folder.href;
      return findSeriesFolderRecursive(nextUrl, title, year, depth + 1);
    });
    return Promise.all(tasks).then(function(results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i]) return results[i];
      }
      return null;
    });
  }).catch(function() { return null; });
}

function findSeasonFolder(seriesUrl, seasonNum) {
  return fetchDir(seriesUrl).then(function(items) {
    var seasonStr = "Season " + seasonNum;
    var seasonStrZero = "Season " + pad2(seasonNum);
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

function searchTvEpisodeOnServer(server, title, year, season, episode) {
  var baseUrl = server.base + server.root;
  // First, find the series folder recursively from root
  return findSeriesFolderRecursive(baseUrl, title, year).then(function(seriesFolder) {
    if (!seriesFolder) return null;
    var seriesUrl = seriesFolder.href ? baseUrl + seriesFolder.href : baseUrl;
    if (seriesUrl.slice(-1) !== "/") seriesUrl += "/";
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
        if (server.supportsMovies) {
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
        if (server.supportsTv) {
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

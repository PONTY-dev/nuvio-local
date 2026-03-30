// ============================================================
//  DhakaFlix Unified Provider for Nuvio (HTML‑based)
//  Uses the exact category paths from CloudStream Kotlin plugin
//  Supports servers 7, 9, 12, 14 – movies + TV series
// ============================================================

var TMDB_API_KEY = "4ef0d7355d9ffb5151e987764708ce96";

// ------------------------------------------------------------------
// Server configurations – based on Kotlin plugin
// ------------------------------------------------------------------
var SERVERS = [
  {
    base: "http://172.16.50.7",
    root: "/DHAKA-FLIX-7/",
    name: "7",
    movieCategories: [
      "English Movies/",
      "English Movies (1080p)/",
      "3D Movies/",
      "Foreign Language Movies/Japanese Language/",
      "Foreign Language Movies/Korean Language/",
      "Foreign Language Movies/Bangla Dubbing Movies/",
      "Foreign Language Movies/Pakistani Movie/",
      "Kolkata Bangla Movies/",
      "Foreign Language Movies/Chinese Language/"
    ],
    tvCategories: []
  },
  {
    base: "http://172.16.50.9",
    root: "/DHAKA-FLIX-9/",
    name: "9",
    movieCategories: [],
    tvCategories: [
      "Anime %26 Cartoon TV Series/Anime-TV Series ♥%20 A%20 —%20 F/",
      "KOREAN TV %26 WEB Series/",
      "Documentary/",
      "Awards %26 TV Shows/%23 TV SPECIAL %26 SHOWS/",
      "Awards %26 TV Shows/%23 AWARDS/",
      "WWE %26 AEW Wrestling/WWE Wrestling/",
      "WWE %26 AEW Wrestling/AEW Wrestling/"
    ]
  },
  {
    base: "http://172.16.50.12",
    root: "/DHAKA-FLIX-12/",
    name: "12",
    movieCategories: [],
    tvCategories: [
      "TV-WEB-Series/TV Series ★%20 0%20 —%20 9/",
      "TV-WEB-Series/TV Series ♥%20 A%20 —%20 L/",
      "TV-WEB-Series/TV Series ♦%20 M%20 —%20 R/",
      "TV-WEB-Series/TV Series ♦%20 S%20 —%20 Z/"
    ]
  },
  {
    base: "http://172.16.50.14",
    root: "/DHAKA-FLIX-14/",
    name: "14",
    movieCategories: [
      "Animation Movies (1080p)/",
      "English Movies (1080p)/",
      "Hindi Movies/",
      "IMDb Top-250 Movies/",
      "SOUTH INDIAN MOVIES/Hindi Dubbed/",
      "SOUTH INDIAN MOVIES/South Movies/"
    ],
    tvCategories: [
      "KOREAN TV %26 WEB Series/"
    ]
  }
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
// Generic recursive search for a folder matching title and year
// ------------------------------------------------------------------
function findMatchingFolderRecursive(rootUrl, title, year, depth) {
  depth = depth || 0;
  if (depth > 8) return Promise.resolve(null); // limit recursion

  return fetchDir(rootUrl).then(function(items) {
    // Check current folder name (if it's a folder itself)
    var currentName = decodeURIComponent(rootUrl.split("/").pop().replace(/\+/g, " "));
    if (currentName) {
      var normCurrent = normalize(currentName);
      var normTitle = normalize(title);
      var containsTitle = normCurrent.indexOf(normTitle) !== -1;
      var containsYear = year && currentName.indexOf("(" + year + ")") !== -1;
      // If this folder contains title and (optionally) year, and it's not the root category, it's a candidate
      if (containsTitle && (containsYear || !year) && !rootUrl.endsWith("/" + year + "/")) {
        return { href: "", name: currentName };
      }
    }

    // Search subfolders
    var folders = items.filter(function(i) { return i.href.endsWith("/"); });
    var tasks = folders.map(function(folder) {
      var nextUrl = rootUrl + folder.href;
      return findMatchingFolderRecursive(nextUrl, title, year, depth + 1);
    });
    return Promise.all(tasks).then(function(results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i]) return results[i];
      }
      return null;
    });
  }).catch(function() { return null; });
}

// ------------------------------------------------------------------
// Movie search – find folder containing title & year, then look for video
// ------------------------------------------------------------------
function searchMovieOnServer(server, title, year) {
  var serverUrl = server.base + server.root;

  var tasks = [];
  for (var c = 0; c < server.movieCategories.length; c++) {
    var categoryUrl = serverUrl + server.movieCategories[c];
    if (categoryUrl.slice(-1) !== "/") categoryUrl += "/";
    tasks.push(
      findMatchingFolderRecursive(categoryUrl, title, year).then(function(folder) {
        if (!folder) return null;
        var folderUrl = folder.href ? categoryUrl + folder.href : categoryUrl;
        if (folderUrl.slice(-1) !== "/") folderUrl += "/";
        // Now look for a video file directly inside this folder
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
      })
    );
  }

  return Promise.all(tasks).then(function(results) {
    return results.find(function(r) { return r !== null; }) || null;
  });
}

// ------------------------------------------------------------------
// TV series search – find series folder, then season, episode
// ------------------------------------------------------------------
function findSeriesFolderRecursive(rootUrl, title, year, depth) {
  depth = depth || 0;
  if (depth > 6) return Promise.resolve(null);
  return fetchDir(rootUrl).then(function(items) {
    var rootName = decodeURIComponent(rootUrl.split("/").pop().replace(/\+/g, " "));
    var normRoot = normalize(rootName);
    var normTitle = normalize(title);
    var containsTitle = normRoot.indexOf(normTitle) !== -1;
    var containsYear = year && rootName.indexOf("(" + year + ")") !== -1;
    if (containsTitle && (containsYear || !year)) {
      return { href: "", name: rootName };
    }
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
  var serverUrl = server.base + server.root;

  var tasks = [];
  for (var c = 0; c < server.tvCategories.length; c++) {
    var categoryUrl = serverUrl + server.tvCategories[c];
    if (categoryUrl.slice(-1) !== "/") categoryUrl += "/";
    tasks.push(
      findSeriesFolderRecursive(categoryUrl, title, year).then(function(seriesFolder) {
        if (!seriesFolder) return null;
        var seriesUrl = seriesFolder.href ? categoryUrl + seriesFolder.href : categoryUrl;
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
      })
    );
  }

  return Promise.all(tasks).then(function(results) {
    return results.find(function(r) { return r !== null; }) || null;
  });
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
        if (server.movieCategories.length > 0) {
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
        if (server.tvCategories.length > 0) {
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

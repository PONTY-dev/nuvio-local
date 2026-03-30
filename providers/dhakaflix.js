// ============================================================
//  DhakaFlix Unified Provider for Nuvio
//  Supports servers: 7, 9, 12, 14 (from CloudStream Kotlin)
//  Movies + TV series with recursive folder search
// ============================================================

var TMDB_API_KEY = "4ef0d7355d9ffb5151e987764708ce96";

// ------------------------------------------------------------------
// Server configurations – edit only if your paths change
// ------------------------------------------------------------------
var SERVERS = [
  {
    base: "http://172.16.50.7",
    root: "/DHAKA-FLIX-7/",
    movieSections: [
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
    tvSections: []
  },
  {
    base: "http://172.16.50.9",
    root: "/DHAKA-FLIX-9/",
    movieSections: [],
    tvSections: [
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
    movieSections: [],
    tvSections: [
      "TV-WEB-Series/TV Series ★%20 0%20 —%20 9/",
      "TV-WEB-Series/TV Series ♥%20 A%20 —%20 L/",
      "TV-WEB-Series/TV Series ♦%20 M%20 —%20 R/",
      "TV-WEB-Series/TV Series ♦%20 S%20 —%20 Z/"
    ]
  },
  {
    base: "http://172.16.50.14",
    root: "/DHAKA-FLIX-14/",
    movieSections: [
      "Animation Movies (1080p)/",
      "English Movies (1080p)/",
      "Hindi Movies/",
      "IMDb Top-250 Movies/",
      "SOUTH INDIAN MOVIES/Hindi Dubbed/",
      "SOUTH INDIAN MOVIES/South Movies/"
    ],
    tvSections: [
      "KOREAN TV %26 WEB Series/"
    ]
  }
];

var VIDEO_EXTS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv"];

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------
function isVideo(name) {
  var lower = (name || "").toLowerCase();
  return VIDEO_EXTS.some(function(ext) { return lower.endsWith(ext); });
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

function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanSeriesName(folderName) {
  return folderName.replace(/\s*\([^)]*\)/g, "").trim();
}

function matchScore(folderName, title) {
  var a = normalize(cleanSeriesName(folderName));
  var b = normalize(title);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.indexOf(b) !== -1) return 0.9;
  if (b.indexOf(a) !== -1) return 0.85;
  var words = b.split(" ").filter(Boolean);
  var hits = words.filter(function(w) { return a.indexOf(w) !== -1; });
  return hits.length / words.length * 0.7;
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
// TMDB Helpers
// ------------------------------------------------------------------
function getMovieInfo(tmdbId) {
  var url = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
  return fetch(url).then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.release_date ? parseInt(d.release_date.split("-")[0]) : null;
      return { title: d.title || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

function getSeriesInfo(tmdbId) {
  var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=en-US";
  return fetch(url).then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.first_air_date ? parseInt(d.first_air_date.split("-")[0]) : null;
      return { title: d.name || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

// ------------------------------------------------------------------
// Movie search (with year folders)
// ------------------------------------------------------------------
function searchMovieInSection(sectionBaseUrl, title, year) {
  // sectionBaseUrl already includes the server base + root + section path
  return fetchDir(sectionBaseUrl).then(function(yearDirs) {
    var candidates = yearDirs.slice(); // copy
    // move exact year folder to front
    var exact = yearDirs.find(function(d) { return d.name === "(" + year + ")"; });
    if (exact) {
      candidates = [exact].concat(candidates.filter(function(d) { return d !== exact; }));
    }
    var chain = Promise.resolve(null);
    for (var i = 0; i < candidates.length; i++) {
      chain = chain.then(function(result) {
        if (result) return result;
        var yDir = candidates[i];
        var movieListUrl = sectionBaseUrl + yDir.href;
        return fetchDir(movieListUrl).then(function(movieDirs) {
          var best = null, bestScore = 0;
          movieDirs.forEach(function(m) {
            var score = matchScore(m.name, title);
            if (score > bestScore) { bestScore = score; best = m; }
          });
          if (!best || bestScore < 0.55) return null;
          var movieUrl = movieListUrl + best.href;
          if (movieUrl.slice(-1) !== "/") movieUrl += "/";
          return fetchDir(movieUrl).then(function(files) {
            var video = files.find(function(f) { return isVideo(f.name); });
            if (!video) return null;
            var quality = detectQuality(video.name);
            return {
              url: movieUrl + encodeURIComponent(video.name),
              quality: quality,
              serverName: sectionBaseUrl.split("/")[2] // rough server name
            };
          });
        });
      });
    }
    return chain;
  }).catch(function() { return null; });
}

// ------------------------------------------------------------------
// TV series recursive search
// ------------------------------------------------------------------
function findSeriesFolderRecursive(rootUrl, title, year, depth) {
  depth = depth || 0;
  if (depth > 6) return Promise.resolve(null);
  return fetchDir(rootUrl).then(function(items) {
    var rootName = decodeURIComponent(rootUrl.split("/").pop().replace(/\+/g, " "));
    var cleanRoot = cleanSeriesName(rootName);
    var rootScore = matchScore(cleanRoot, title);
    if (year && rootName.indexOf("(" + year) !== -1) rootScore += 0.2;
    if (rootScore >= 0.6) {
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
    var found = items.find(function(i) { return i.name === seasonStr || i.name === seasonStrZero; });
    return found || null;
  });
}

function findEpisodeFile(seasonUrl, seasonNum, episodeNum) {
  return fetchDir(seasonUrl).then(function(files) {
    var pattern = new RegExp("S" + pad2(seasonNum) + "E" + pad2(episodeNum), "i");
    var found = files.find(function(f) { return isVideo(f.name) && pattern.test(f.name); });
    return found || null;
  });
}

function searchTvInSection(sectionBaseUrl, title, year, season, episode) {
  return findSeriesFolderRecursive(sectionBaseUrl, title, year).then(function(seriesFolder) {
    if (!seriesFolder) return null;
    var seriesUrl = seriesFolder.href ? sectionBaseUrl + seriesFolder.href : sectionBaseUrl;
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
          serverName: sectionBaseUrl.split("/")[2]
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
        var baseUrl = server.base + server.root;
        for (var m = 0; m < server.movieSections.length; m++) {
          var sectionPath = server.movieSections[m];
          var fullUrl = baseUrl + sectionPath;
          if (fullUrl.slice(-1) !== "/") fullUrl += "/";
          tasks.push(
            searchMovieInSection(fullUrl, info.title, info.year)
              .then(function(result) {
                if (!result) return null;
                return {
                  url: result.url,
                  quality: result.quality,
                  title: "DhakaFlix (" + result.serverName + ") · " + result.quality,
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
        var baseUrl = server.base + server.root;
        for (var t = 0; t < server.tvSections.length; t++) {
          var sectionPath = server.tvSections[t];
          var fullUrl = baseUrl + sectionPath;
          if (fullUrl.slice(-1) !== "/") fullUrl += "/";
          tasks.push(
            searchTvInSection(fullUrl, info.title, info.year, season, episode)
              .then(function(result) {
                if (!result) return null;
                return {
                  url: result.url,
                  quality: result.quality,
                  title: "DhakaFlix (" + result.serverName + ") · " + result.quality,
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

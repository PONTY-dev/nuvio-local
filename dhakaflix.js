// ============================================================
//  DhakaFlix Local Provider for Nuvio (Movies + TV Series)
//  Author: PONTY-dev (TV recursive search added)
//
//  ⚙️  CONFIGURE PATHS BELOW BEFORE UPLOADING!
// ============================================================

// ---- SET YOUR SERVER ROOT URL ---------------------------------
var SERVER_BASE = "http://172.16.50.12";   // ← change to your server IP
var SERVER_ROOT = "/DHAKA-FLIX-12";        // ← the subfolder (if any) where your files are hosted

// ---- TV series folders (relative to SERVER_BASE + SERVER_ROOT) ----
var TV_SECTIONS = [
  "TV-WEB-Series/",
  "KOREAN TV & WEB SERIES/",
  "CARTOON TV SERIES/"
];

// ---- Movie folders (relative to SERVER_BASE + SERVER_ROOT) ----
var MOVIE_SECTIONS = [
  { path: "English%20Movies/",          label: "English Movies",   quality: "720p"  },
  { path: "English%20Movies-1080P/",    label: "English 1080p",    quality: "1080p" },
  { path: "IMDB%20TOP-250%20MOVIES/",   label: "IMDB Top-250",     quality: "720p"  }
];

// --------------------------------------------------------------

var VIDEO_EXTS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv"];
var TMDB_API_KEY = "4ef0d7355d9ffb5151e987764708ce96";

// ── Utilities ─────────────────────────────────────────────

function isVideo(name) {
  var lower = (name || "").toLowerCase();
  for (var i = 0; i < VIDEO_EXTS.length; i++) {
    if (lower.slice(-VIDEO_EXTS[i].length) === VIDEO_EXTS[i]) return true;
  }
  return false;
}

function norm(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchScore(folderName, title) {
  var a = norm(folderName);
  var b = norm(title);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.indexOf(b) !== -1) return 0.9;
  if (b.indexOf(a) !== -1) return 0.85;
  var words = b.split(" ").filter(Boolean);
  var hits = words.filter(function(w) { return a.indexOf(norm(w)) !== -1; });
  return hits.length / words.length * 0.7;
}
// ── TMDB lookup ────────────────────────────────────────────

function getMovieInfo(tmdbId) {
  var url = "https://api.themoviedb.org/3/movie/" + tmdbId
    + "?api_key=" + TMDB_API_KEY + "&language=en-US";
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.release_date ? parseInt(d.release_date.split("-")[0]) : null;
      return { title: d.title || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

function getSeriesInfo(tmdbId) {
  var url = "https://api.themoviedb.org/3/tv/" + tmdbId
    + "?api_key=" + TMDB_API_KEY + "&language=en-US";
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var year = d.first_air_date ? parseInt(d.first_air_date.split("-")[0]) : null;
      return { title: d.name || "", year: year };
    })
    .catch(function() { return { title: "", year: null }; });
}

// ── Recursive search for TV series folder ──────────────────

function cleanSeriesName(folderName) {
  // Remove common patterns like "(TV Series 2011–2017)" and year ranges
  return folderName.replace(/\s*\([^)]*\)/g, "").trim();
}

function findSeriesFolderRecursive(rootUrl, title, year, depth) {
  depth = depth || 0;
  if (depth > 6) return Promise.resolve(null); // safety limit

  return fetchDir(rootUrl).then(function(items) {
    // First check if current folder matches the series
    var rootName = decodeURIComponent(rootUrl.split("/").pop().replace(/\+/g, " "));
    var cleanRoot = cleanSeriesName(rootName);
    var rootScore = matchScore(cleanRoot, title);
    if (year && rootName.indexOf("(" + year) !== -1) rootScore += 0.2;
    if (rootScore >= 0.6) {
      // The series folder is this one
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

// ── TV Series: find season folder ──────────────────────────

function findSeasonFolder(seriesUrl, seasonNum) {
  return fetchDir(seriesUrl).then(function(items) {
    var seasonStr = "Season " + seasonNum;
    var seasonStrZero = "Season " + (seasonNum < 10 ? "0" + seasonNum : seasonNum);
    for (var i = 0; i < items.length; i++) {
      var name = items[i].name;
      if (name === seasonStr || name === seasonStrZero) {
        return items[i];
      }
    }
    return null;
  });
}

// ── TV Series: find episode file ───────────────────────────

function findEpisodeFile(seasonUrl, seasonNum, episodeNum) {
  return fetchDir(seasonUrl).then(function(files) {
    var pattern = new RegExp("S" + pad2(seasonNum) + "E" + pad2(episodeNum), "i");
    for (var i = 0; i < files.length; i++) {
      var name = files[i].name;
      if (isVideo(name) && pattern.test(name)) {
        return files[i];
      }
    }
    return null;
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

// ── Search one TV section for an episode ───────────────────

function searchTvSection(sectionPath, title, year, season, episode) {
  var sectionUrl = SERVER_BASE + SERVER_ROOT + "/" + sectionPath;
  // Ensure trailing slash
  if (sectionUrl.slice(-1) !== "/") sectionUrl += "/";

  return findSeriesFolderRecursive(sectionUrl, title, year).then(function(seriesFolder) {
    if (!seriesFolder) return null;
    var seriesUrl = seriesFolder.href ? sectionUrl + seriesFolder.href : sectionUrl;
    if (seriesUrl.slice(-1) !== "/") seriesUrl += "/";

    return findSeasonFolder(seriesUrl, season).then(function(seasonFolder) {
      if (!seasonFolder) return null;
      var seasonUrl = seriesUrl + seasonFolder.href;
      if (seasonUrl.slice(-1) !== "/") seasonUrl += "/";

      return findEpisodeFile(seasonUrl, season, episode).then(function(epFile) {
        if (!epFile) return null;

        var quality = detectQuality(epFile.name);
        return {
          url:     seasonUrl + encodeURIComponent(epFile.name),
          label:   sectionPath.replace(/\/$/, ""),
          quality: quality
        };
      });
    });
  }).catch(function() { return null; });
          }
/ ── Movie search (unchanged) ───────────────────────────────

function searchMovieSection(section, title, year) {
  var sectionUrl = SERVER_BASE + SERVER_ROOT + "/" + section.path;
  if (sectionUrl.slice(-1) !== "/") sectionUrl += "/";

  return fetchDir(sectionUrl).then(function(yearDirs) {
    var yearFolder = year ? "(" + year + ")" : null;
    var preferred = yearFolder
      ? yearDirs.filter(function(d) { return d.name === yearFolder; })
      : [];
    var rest = yearDirs.filter(function(d) {
      return !yearFolder || d.name !== yearFolder;
    });
    var ordered = preferred.concat(rest);

    return ordered.reduce(function(chain, yearEntry) {
      return chain.then(function(found) {
        if (found) return found;

        return fetchDir(sectionUrl + yearEntry.href).then(function(movieDirs) {
          var best = null, bestScore = 0;
          movieDirs.forEach(function(m) {
            var s = matchScore(m.name, title);
            if (s > bestScore) { bestScore = s; best = m; }
          });
          if (!best || bestScore < 0.55) return null;

          var movieUrl = sectionUrl + yearEntry.href + best.href;
          if (movieUrl.slice(-1) !== "/") movieUrl += "/";

          return fetchDir(movieUrl).then(function(files) {
            var video = null;
            for (var i = 0; i < files.length; i++) {
              if (isVideo(files[i].name)) { video = files[i]; break; }
            }
            if (!video) return null;

            var quality = detectQuality(video.name) || section.quality;
            return {
              url:     movieUrl + encodeURIComponent(video.name),
              label:   section.label,
              quality: quality
            };
          });
        });
      });
    }, Promise.resolve(null));
  }).catch(function() { return null; });
}

// ── Main entry point ───────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  // Movies
  if (mediaType === "movie") {
    return getMovieInfo(tmdbId).then(function(info) {
      if (!info.title) return [];

      var searches = MOVIE_SECTIONS.map(function(section) {
        return searchMovieSection(section, info.title, info.year)
          .then(function(result) {
            if (!result) return null;
            return {
              url:      result.url,
              quality:  result.quality,
              title:    "DhakaFlix · " + result.label + " · " + result.quality,
              provider: "DhakaFlix"
            };
          })
          .catch(function() { return null; });
      });

      return Promise.all(searches).then(function(results) {
        return results.filter(function(r) { return r !== null; });
      });
    });
  }

  // TV Series
  if (mediaType === "series" || mediaType === "tv") {
    if (!season || !episode) return Promise.resolve([]);

    return getSeriesInfo(tmdbId).then(function(info) {
      if (!info.title) return [];

      var searches = TV_SECTIONS.map(function(sectionPath) {
        return searchTvSection(sectionPath, info.title, info.year, season, episode)
          .then(function(result) {
            if (!result) return null;
            return {
              url:      result.url,
              quality:  result.quality,
              title:    "DhakaFlix · " + result.label + " · " + result.quality,
              provider: "DhakaFlix"
            };
          })
          .catch(function() { return null; });
      });

      return Promise.all(searches).then(function(results) {
        return results.filter(function(r) { return r !== null; });
      });
    });
  }

  return Promise.resolve([]);
}

module.exports = { getStreams: getStreams };
```

---

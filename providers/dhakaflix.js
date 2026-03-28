// ============================================================
//  DhakaFlix Local Provider for Nuvio
//  Author: PONTY-dev
//
//  ⚙️  SET YOUR SERVER IP ON LINE 10 BEFORE UPLOADING!
// ============================================================

var SERVER_BASE = "http://172.16.50.7";   // ← your DhakaFlix server IP

var TMDB_API_KEY = "4ef0d7355d9ffb5151e987764708ce96"; // free public TMDB key

var SECTIONS = [
  { path: "/English%20Movies/",          label: "English Movies",   quality: "720p"  },
  { path: "/English%20Movies-1080P/",    label: "English 1080p",    quality: "1080p" },
  { path: "/IMDB%20TOP-250%20MOVIES/",   label: "IMDB Top-250",     quality: "720p"  }
];

var VIDEO_EXTS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv"];

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

// ── Search one section for a movie ─────────────────────────

function searchSection(section, title, year) {
  // Try the year-specific folder first, fall back to all year folders
  var sectionUrl = SERVER_BASE + section.path;

  return fetchDir(sectionUrl).then(function(yearDirs) {
    var yearFolder = year ? "(" + year + ")" : null;
    var preferred = yearFolder
      ? yearDirs.filter(function(d) { return d.name === yearFolder; })
      : [];
    var rest = yearDirs.filter(function(d) {
      return !yearFolder || d.name !== yearFolder;
    });

    // Search preferred (year match) first, then rest
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
          return fetchDir(movieUrl).then(function(files) {
            var video = null;
            for (var i = 0; i < files.length; i++) {
              if (isVideo(files[i].name)) { video = files[i]; break; }
            }
            if (!video) return null;

            var nameCheck = (best.name + video.name).toLowerCase();
            var q = nameCheck.indexOf("2160") !== -1 ? "4K"
                : nameCheck.indexOf("1080") !== -1 ? "1080p"
                  : nameCheck.indexOf("720")  !== -1 ? "720p"
                  : section.quality;

            return {
              url:     movieUrl + encodeURIComponent(video.name),
              label:   section.label,
              quality: q
            };
          });
        });
      });
    }, Promise.resolve(null));
  }).catch(function() { return null; });
}

// ── Main entry point ───────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== "movie") return Promise.resolve([]);

  return getMovieInfo(tmdbId).then(function(info) {
    if (!info.title) return [];

    var searches = SECTIONS.map(function(section) {
      return searchSection(section, info.title, info.year)
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

module.exports = { getStreams: getStreams };

/**
 * DhakaFlix BDIX Provider for Nuvio
 * TV server: http://172.16.50.12
 *
 * REAL TV STRUCTURE (confirmed from server screenshots):
 *
 *   /DHAKA-FLIX-12/TV-WEB-Series/
 *     TV Series ★ 0 — 9/          ← titles starting with 0-9
 *     TV Series ♥ A — L/          ← titles starting with A-L
 *     TV Series ♦ M — R/          ← titles starting with M-R
 *     TV Series ♦ S — Z/          ← titles starting with S-Z
 *       Show Name (TV Series 2024– ) 1080p [Dual Audio]/
 *         Season 1/
 *           ShowName.S01E01.mkv
 *
 * All async/await → Promise chains (Hermes JS engine compat)
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────

var TV_BASE          = "http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/";
var FETCH_TIMEOUT_MS = 8000;
var TMDB_API_KEY     = "YOUR_TMDB_API_KEY"; // replace
var TMDB_BASE        = "https://api.themoviedb.org/3";

// ─── RANGE BUCKET MAP ─────────────────────────────────────────────────────────
// Pre-encoded folder names — avoids any Unicode encodeURIComponent issues in Hermes

var RANGE_FOLDERS = [
  {
    test: function (ch) { return ch >= "0" && ch <= "9"; },
    encoded: "TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/"
  },
  {
    test: function (ch) { return ch >= "A" && ch <= "L"; },
    encoded: "TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/"
  },
  {
    test: function (ch) { return ch >= "M" && ch <= "R"; },
    encoded: "TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/"
  },
  {
    test: function (ch) { return ch >= "S" && ch <= "Z"; },
    encoded: "TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/"
  }
];

/**
 * Given a show title, return the full URL of its range folder.
 * Strips leading articles (The, A, An) before bucketing — e.g.
 * "The Bear" → B → A–L bucket.
 */
function getRangeFolderUrl(title) {
  var stripped = title.replace(/^(the|a|an)\s+/i, "").trim();
  var ch = stripped.charAt(0).toUpperCase();

  for (var i = 0; i < RANGE_FOLDERS.length; i++) {
    if (RANGE_FOLDERS[i].test(ch)) {
      return TV_BASE + RANGE_FOLDERS[i].encoded;
    }
  }
  return TV_BASE + RANGE_FOLDERS[1].encoded; // fallback A–L
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function logAndReturn(fallback) {
  return function (err) {
    console.warn("[DhakaFlix TV]", err && err.message ? err.message : String(err));
    return fallback;
  };
}

function fetchWithTimeout(url) {
  if (typeof AbortController !== "undefined") {
    var controller = new AbortController();
    var tid = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, { signal: controller.signal })
      .then(function (res) { clearTimeout(tid); return res; })
      .catch(function (err) {
        clearTimeout(tid);
        throw new Error("Fetch failed [" + url + "]: " + (err.message || err));
      });
  }
  return fetch(url);
}

function parseDirectoryListing(html) {
  var results = [];
  var re = /href=["']([^"'?#]+)["']/gi;
  var match;
  while ((match = re.exec(html)) !== null) {
    var href = match[1];
    if (
      href === "../" || href === "./" ||
      href.indexOf("://") !== -1 ||
      href.charAt(0) === "?" ||
      href.charAt(0) === "/"
    ) continue;
    results.push(href);
  }
  return results;
}

function decodeName(href) {
  try {
    return decodeURIComponent(href.replace(/\/$/, "").replace(/\+/g, " "));
  } catch (e) {
    return href.replace(/\/$/, "");
  }
}

function normalise(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Strip DhakaFlix show-folder metadata suffix so we can match against a clean title.
 * "3 Body Problem (TV Series 2024– ) 1080p [Dual Audio]" → "3 Body Problem"
 */
function stripShowSuffix(name) {
  return name
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i, "")
    .replace(/\s*(1080p|720p|480p|4k|dual\s*audio|\[.*?\]).*/i, "")
    .trim();
}

function matchScore(folderName, targetTitle) {
  var clean  = normalise(stripShowSuffix(folderName));
  var target = normalise(targetTitle);
  var words  = target.split(" ").filter(function (w) { return w.length > 1; });
  if (words.length === 0) return 0;
  var hits = words.filter(function (w) { return clean.indexOf(w) !== -1; }).length;
  return hits / words.length;
}

// ─── TV STREAMS ───────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS = String(season).padStart(2, "0");
  var padE = String(episode).padStart(2, "0");
  var epPattern = new RegExp("S0*" + season + "E0*" + episode + "(?!\\d)", "i");

  var rangeFolderUrl = getRangeFolderUrl(title);
  console.warn("[DhakaFlix TV] Range folder:", rangeFolderUrl);

  // ── Step 1: find the show folder inside the range bucket ──
  return fetchWithTimeout(rangeFolderUrl)
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var entries = parseDirectoryListing(html);

      var scored = entries.map(function (entry) {
        return { entry: entry, score: matchScore(decodeName(entry), title) };
      });
      scored.sort(function (a, b) { return b.score - a.score; });

      if (scored.length === 0 || scored[0].score < 0.5) {
        throw new Error(
          "Show \"" + title + "\" not found. Best: " +
          (scored[0] ? decodeName(scored[0].entry) + " (" + scored[0].score.toFixed(2) + ")" : "none")
        );
      }

      console.warn("[DhakaFlix TV] Show match:", decodeName(scored[0].entry), scored[0].score.toFixed(2));
      return rangeFolderUrl + scored[0].entry;
    })

    // ── Step 2: find Season N inside the show folder ──
    .then(function (showUrl) {
      return fetchWithTimeout(showUrl)
        .then(function (res) { return res.text(); })
        .then(function (html) {
          var entries = parseDirectoryListing(html);
          var seasonPattern = new RegExp("^Season\\s*0*" + season + "\\s*/?$", "i");
          var seasonFolder  = entries.find(function (e) {
            return seasonPattern.test(decodeName(e).trim());
          });

          if (!seasonFolder) {
            var available = entries
              .filter(function (e) { return /season/i.test(e); })
              .map(function (e) { return decodeName(e); });
            throw new Error("Season " + season + " not found. Available: [" + available.join(", ") + "]");
          }

          console.warn("[DhakaFlix TV] Season folder:", decodeName(seasonFolder));
          return showUrl + seasonFolder;
        });
    })

    // ── Step 3: find the episode file inside the Season folder ──
    .then(function (seasonUrl) {
      return fetchWithTimeout(seasonUrl)
        .then(function (res) { return res.text(); })
        .then(function (html) {
          var entries = parseDirectoryListing(html);
          var videoFiles = entries.filter(function (e) {
            return /\.(mkv|mp4|avi|m3u8)$/i.test(e);
          });

          var epFile = videoFiles.find(function (f) {
            return epPattern.test(decodeName(f));
          });

          if (!epFile) {
            var sample = videoFiles.slice(0, 5).map(function (f) { return decodeName(f); });
            throw new Error("S" + padS + "E" + padE + " not found. Sample: [" + sample.join(", ") + "]");
          }

          var fileUrl = seasonUrl + epFile;
          console.warn("[DhakaFlix TV] Stream URL:", fileUrl);

          return [{
            title: "DhakaFlix BDIX",
            description: "S" + padS + "E" + padE + " · " + decodeName(epFile),
            url: fileUrl,
            behaviorHints: { notWebReady: false }
          }];
        });
    })
    .catch(logAndReturn([]));
}

// ─── TMDB RESOLVER ────────────────────────────────────────────────────────────

function resolveTmdb(type, tmdbId) {
  var parts   = String(tmdbId).split(":");
  var id      = parts[0];
  var season  = parts[1] ? parseInt(parts[1], 10) : null;
  var episode = parts[2] ? parseInt(parts[2], 10) : null;

  var endpoint = type === "movie"
    ? TMDB_BASE + "/movie/" + id + "?api_key=" + TMDB_API_KEY
    : TMDB_BASE + "/tv/"    + id + "?api_key=" + TMDB_API_KEY;

  return fetchWithTimeout(endpoint)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (type === "movie") {
        return {
          title: data.title || data.original_title,
          year:  data.release_date ? data.release_date.slice(0, 4) : ""
        };
      }
      return {
        title:   data.name || data.original_name,
        year:    data.first_air_date ? data.first_air_date.slice(0, 4) : "",
        season:  season,
        episode: episode
      };
    })
    .catch(logAndReturn(null));
}

// ─── PROVIDER EXPORT ──────────────────────────────────────────────────────────

var provider = {
  name: "DhakaFlix",
  description: "BDIX · 172.16.50.12 · TV Series",
  version: "1.2.0",

  getStreams: function (type, tmdbId) {
    return resolveTmdb(type, tmdbId).then(function (meta) {
      if (!meta) return [];
      if (type === "tv") {
        return getTvStreams(meta.title, meta.season, meta.episode);
      }
      return [];
    });
  }
};

if (typeof module !== "undefined") module.exports = provider;

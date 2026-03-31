function getStreams(tmdbId, media) {
  console.error('[DhakaFlix] id=' + tmdbId + ' media=' + JSON.stringify(media));
  return [];
}
module.exports = { getStreams: getStreams };  while ((m = re.exec(html)) !== null) {
    var h = m[1];
    if (h==='../'||h==='./'||h.indexOf('://')!==-1||h[0]==='?'||h[0]==='/') continue;
    out.push(h);
  }
  return out;
}

function decode(href) {
  try { return decodeURIComponent(href.replace(/\/$/,'').replace(/\+/g,' ')); }
  catch(e) { return href.replace(/\/$/,''); }
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

function scoreEntry(href, target) {
  var clean = decode(href)
    .replace(/\s*\(TV\s*(Series|Mini[\s-]Series)[^)]*\).*/i,'')
    .replace(/\s*(1080p|720p|480p|4k|dual\s*audio|\[.*?\]).*/i,'')
    .trim();
  var a = norm(clean), b = norm(target);
  var words = b.split(' ').filter(function(w){ return w.length > 1; });
  if (!words.length) return 0;
  return words.filter(function(w){ return a.indexOf(w) !== -1; }).length / words.length;
}

function bestMatch(entries, target) {
  var best = null, top = 0;
  entries.forEach(function(e) {
    var s = scoreEntry(e, target);
    if (s > top) { top = s; best = e; }
  });
  return (best && top >= 0.5) ? best : null;
}

// ── TV crawler ───────────────────────────────────────────────────────────────

function getTvStreams(title, season, episode) {
  var padS = season  < 10 ? '0'+season  : ''+season;
  var padE = episode < 10 ? '0'+episode : ''+episode;
  var epRe = new RegExp('S0*'+season+'E0*'+episode+'(?!\\d)','i');
  var rangeUrl = getRangeUrl(title);

  // Step 1 — range bucket → show folder
  return fetch(rangeUrl)
    .then(function(r){ return r.text(); })
    .then(function(html){
      var match = bestMatch(parseDir(html), title);
      if (!match) throw new Error('[DhakaFlix] Show not found: '+title+' in '+rangeUrl);
      return rangeUrl + match;
    })

    // Step 2 — show folder → Season N
    .then(function(showUrl){
      return fetch(showUrl)
        .then(function(r){ return r.text(); })
        .then(function(html){
          var entries = parseDir(html);
          var pat = new RegExp('^Season\\s*0*'+season+'\\s*/?$','i');
          var sf  = entries.find(function(e){ return pat.test(decode(e).trim()); });
          if (!sf) throw new Error('[DhakaFlix] Season '+season+' not found under '+showUrl);
          return showUrl + sf;
        });
    })

    // Step 3 — season folder → episode file
    .then(function(seasonUrl){
      return fetch(seasonUrl)
        .then(function(r){ return r.text(); })
        .then(function(html){
          var files = parseDir(html).filter(function(e){
            return /\.(mkv|mp4|avi|m3u8)$/i.test(e);
          });
          var epFile = files.find(function(f){ return epRe.test(decode(f)); });
          if (!epFile) throw new Error('[DhakaFlix] S'+padS+'E'+padE+' not found in '+seasonUrl);
          return [{
            name:    'DhakaFlix',
            title:   title+' S'+padS+'E'+padE,
            url:     seasonUrl + epFile,
            quality: 'BDIX'
          }];
        });
    })
    .catch(function(e){
      console.error(e.message || String(e));
      return [];
    });
}

// ── Entry point ──────────────────────────────────────────────────────────────

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type    : 'movie';
  var season  = media && media.season  ? media.season  : 1;
  var episode = media && media.episode ? media.episode : 1;
  var isMovie = type === 'movie';

  var tmdbUrl = isMovie
    ? TMDB_BASE+'/movie/'+tmdbId+'?api_key='+TMDB_KEY
    : TMDB_BASE+'/tv/'   +tmdbId+'?api_key='+TMDB_KEY;

  return fetch(tmdbUrl)
    .then(function(r){ return r.json(); })
    .then(function(data){
      var title   = isMovie ? data.title : data.name;
      var dateStr = isMovie ? data.release_date : data.first_air_date;
      var year    = dateStr ? dateStr.substring(0,4) : '';
      if (!title) return [];

      if (isMovie) {
        // Movie support: add movies IP when available
        console.error('[DhakaFlix] Movie crawl not yet configured');
        return [];
      }

      return getTvStreams(title, season, episode);
    })
    .catch(function(e){
      console.error('[DhakaFlix] TMDB error: '+(e.message||e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function ep(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type            : 'movie';
  var season  = media && media.season  ? parseInt(media.season)  : 1;
  var episode = media && media.episode ? parseInt(media.episode) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var title = isMov ? (d.title || d.original_title) : (d.name || d.original_name);
      var year  = ((isMov ? d.release_date : d.first_air_date) || '').substring(0, 4);
      if (!title || !year) return [];

      var t  = title + ' (' + year + ')';
      var dt = title.replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');
      var yf = parseInt(year) <= 1994 ? ep('(1960-1994)') : ep('(' + year + ')');

      if (isMov) {
        var base = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/' + yf + '/';
        return [
          { name: 'DhakaFlix 720p NF',      url: base + ep(t + ' 720p NF [Dual Audio]')   + '/' + ep(t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv') },
          { name: 'DhakaFlix 720p AMZN',    url: base + ep(t + ' 720p AMZN [Dual Audio]') + '/' + ep(t + ' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv') },
          { name: 'DhakaFlix 720p AMZN 2',  url: base + ep(t + ' 720p AMZN [Dual Audio]') + '/' + ep(t + ' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv') },
          { name: 'DhakaFlix 720p WEBRip',  url: base + ep(t + ' 720p WEBRip')            + '/' + ep(dt + '.' + year + '.720p.WEBRip.800MB.x264-GalaxyRG.mkv') },
          { name: 'DhakaFlix 720p BluRay',  url: base + ep(t + ' 720p')                   + '/' + ep(dt + '.' + year + '.720p.BluRay.x264.ESub-Pahe.mkv') },
          { name: 'DhakaFlix 720p DA',      url: base + ep(t + ' 720p [Dual Audio]')      + '/' + ep(t + ' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv') },
          { name: 'DhakaFlix 720p AMZ',     url: base + ep(t + ' 720p AMZ [Dual Audio]')  + '/' + ep(t + ' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv') },
          { name: 'DhakaFlix 1080p NF',     url: base + ep(t + ' 1080p NF [Dual Audio]')  + '/' + ep(t + ' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv') },
          { name: 'DhakaFlix 1080p AMZN',   url: base + ep(t + ' 1080p AMZN [Dual Audio]')+ '/' + ep(t + ' UNCUT 1080p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv') }
        ].map(function(s) {
          return { name: s.name, title: t, url: s.url, quality: 'BDIX', headers: { 'User-Agent': UA } };
        });
      }

      // TV
      var padS = season  < 10 ? '0' + season  : '' + season;
      var padE = episode < 10 ? '0' + episode : '' + episode;
      var ep2  = 'S' + padS + 'E' + padE;
      var c    = title.trim().charAt(0).toUpperCase();
      var ranges = [
        { test: function(x){ return x>='0'&&x<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
        { test: function(x){ return x>='A'&&x<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
        { test: function(x){ return x>='M'&&x<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
        { test: function(x){ return x>='S'&&x<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
      ];
      var rng = ranges[1];
      for (var i = 0; i < ranges.length; i++) { if (ranges[i].test(c)) { rng = ranges[i]; break; } }

      var tvBase = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/' + rng.path;
      var sfx    = [
        ' (TV Series ' + year + '\u2013 ) 1080p [Dual Audio]',
        ' (TV Series ' + year + '\u2013 ) 720p [Dual Audio]',
        ' (TV Series ' + year + '\u2013 ) 1080p',
        ' (TV Mini Series ' + year + '\u2013 ) 1080p [Dual Audio]',
        ' (TV Series ' + year + ')'
      ];
      var files = [
        dt + '.' + ep2 + '.1080p.mkv',
        dt + '.' + ep2 + '.720p.mkv',
        dt + '.' + ep2 + '.mkv',
        dt + '.' + ep2 + '.1080p.WEBRip.x264.mkv',
        dt + '.' + ep2 + '.720p.WEBRip.x264.mkv'
      ];

      var streams = [], seen = {};
      sfx.forEach(function(sf) {
        files.forEach(function(f) {
          var url = tvBase + ep(title + sf) + '/' + ep('Season ' + season) + '/' + ep(f);
          if (!seen[url]) {
            seen[url] = 1;
            streams.push({ name: 'DhakaFlix TV', title: title + ' ' + ep2, url: url, quality: 'BDIX', headers: { 'User-Agent': UA } });
          }
        });
      });
      return streams;
    })
    .catch(function(e) {
      console.error('[DFlix] ' + e.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

// providers/dakaflix.js
var TMDB_KEY = 'fe4a8b69f7867dea332c4495faeab4c6';
var UA = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Server 7: 720p English movies
var BASE7 = 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/';
// Server 14: 1080p English movies
var BASE14 = 'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/';
// TV server
var TV_BASE = 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/';

var TV_RANGES = [
  { test: function(c){ return c>='0'&&c<='9'; }, path: 'TV%20Series%20%E2%98%85%20%200%20%20%E2%80%94%20%209/' },
  { test: function(c){ return c>='A'&&c<='L'; }, path: 'TV%20Series%20%E2%99%A5%20A%20%E2%80%94%20L/'          },
  { test: function(c){ return c>='M'&&c<='R'; }, path: 'TV%20Series%20%E2%99%A6%20M%20%E2%80%94%20R/'          },
  { test: function(c){ return c>='S'&&c<='Z'; }, path: 'TV%20Series%20%E2%99%A6%20S%20%E2%80%94%20Z/'          }
];

function e(s) { return encodeURIComponent(s).replace(/%2B/gi, '+'); }

function getStreams(tmdbId, media) {
  var type    = media && media.type    ? media.type                  : 'movie';
  var season  = media && media.season  ? parseInt(media.season,  10) : 1;
  var episode = media && media.episode ? parseInt(media.episode, 10) : 1;
  var isMov   = type === 'movie';

  return fetch('https://api.themoviedb.org/3/' + (isMov ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var title   = isMov ? (data.title || data.original_title) : (data.name || data.original_name);
      var dateStr = isMov ? data.release_date : data.first_air_date;
      var year    = dateStr ? dateStr.substring(0, 4) : '';
      if (!title || !year) return [];

      // ── Title transformations ─────────────────────────────────────────────
      // t  = original: "Avatar: Fire and Ash (2025)"
      // ht = hyphenated (colon→hyphen, for folder names): "Avatar-Fire and Ash"
      // ft = clean (for space-format filenames): "Avatar Fire and Ash (2025)"
      // dt = dot format (for old-style filenames): "Avatar.Fire.and.Ash"

      var t  = title + ' (' + year + ')';
      var ht = title.replace(/:\s*/g, '-').replace(/,/g, '');  // colon→hyphen, strip commas
      var ft = title.replace(/:/g, '').replace(/-/g, ' ').replace(/,/g, '').replace(/\s+/g, ' ').trim() + ' (' + year + ')';
      var dt = title.replace(/'/g, '').replace(/[^a-zA-Z0-9]/g, '.').replace(/\.+/g, '.');

      var yf   = parseInt(year, 10) <= 1994 ? e('(1960-1994)') : e('(' + year + ')');
      var yf14 = e('(' + year + ') 1080p'); // server 14 year folder format

      if (isMov) {
        // ── Folder title variants ─────────────────────────────────────────
        // Use both original and hyphenated (for colon titles like "Avatar: Fire and Ash")
        var titles7 = [t]; // folder title options for server 7
        if (ht !== t.replace(' (' + year + ')', '')) titles7.push(ht + ' (' + year + ')');

        var out  = [];
        var seen = {};
        var i, j, folder, file, url, q, src;

        // ── SERVER 7: 720p ────────────────────────────────────────────────
        var base7 = BASE7 + yf + '/';

        // Confirmed pattern groups (folder suffix → file pattern)
        // [folderSuffix, fileSuffix, quality, source]
        var combos7 = [
          // NF Dual Audio (confirmed: A Journey, 27 Nights, Back in Action)
          [' 720p NF [Dual Audio]',    ft+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',           '720p', 'NF'    ],
          [' 720p NF [Dual Audio]',    ft+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 2.0+English 5.1] -mkvC.mkv',           '720p', 'NF'    ],
          [' 720p NF [Dual Audio]',    ft+' 720p NF-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',            '720p', 'NF'    ],
          // AMZN Dual Audio (confirmed: A Game in the Woods, Love Me Love Me)
          [' 720p AMZN [Dual Audio]',  ft+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv',        '720p', 'AMZN'  ],
          [' 720p AMZN [Dual Audio]',  ft+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',  '720p', 'AMZN'  ],
          [' 720p AMZN [Dual Audio]',  ft+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',        '720p', 'AMZN'  ],
          [' 720p AMZ [Dual Audio]',   ft+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv',        '720p', 'AMZN'  ],
          [' 720p AMZ [Dual Audio]',   ft+' UNCUT 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv',  '720p', 'AMZN'  ],
          // DSNP Dual Audio (confirmed: Avatar Fire and Ash)
          [' 720p DSNP [Dual Audio]',  ft+' 720p DSNP-WEB x264 ESub [Dual Audio][Hindi (Clean)+English 5.1] -MsMod.mkv',    '720p', 'DSNP'  ],
          [' 720p DSNP [Dual Audio]',  ft+' 720p DSNP-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv',        '720p', 'DSNP'  ],
          // Generic [Dual Audio] = BluRay (confirmed: Ballerina)
          [' 720p [Dual Audio]',       ft+' 720p BluRay x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',           '720p', 'BluRay'],
          [' 720p [Dual Audio]',       ft+' 720p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',          '720p', 'NF'    ],
          [' 720p [Dual Audio]',       ft+' 720p AMZN-WEB x264 ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv',        '720p', 'AMZN'  ],
          // WEBRip (confirmed: Hellfire, In the Blink of an Eye, A Mistake)
          [' 720p WEBRip',             dt+'.'+year+'.720p.WEB-DL.x264.ESub-MsMod.mkv',                                      '720p', 'WEB'   ],
          [' 720p WEBRip',             dt+'.'+year+'.720p.WEBRip.800MB.x264-GalaxyRG.mkv',                                   '720p', 'WEB'   ],
          [' 720p WEBRip',             dt+'.'+year+'.720p.WEBRip.x264-GalaxyRG.mkv',                                         '720p', 'WEB'   ],
          [' 720p WEBRip [Dual Audio]',dt+'.'+year+'.720p.WEB-DL.x264.ESub-MsMod.mkv',                                      '720p', 'WEB'   ],
          // Plain 720p BluRay (confirmed: A Knight's War [YTS], 12 Angry Men)
          [' 720p',                    dt+'.'+year+'.720p.BluRay.x264.AAC-[YTS.MX].mp4',                                     '720p', 'YTS'   ],
          [' 720p',                    dt+'.'+year+'.720p.BluRay.x264.ESub-Pahe.mkv',                                        '720p', 'BluRay'],
          [' 720p',                    dt+'.'+year+'.720p.BluRay.x264.mkv',                                                   '720p', 'BluRay']
        ];

        for (i = 0; i < titles7.length; i++) {
          var folderTitle = titles7[i].replace(' (' + year + ')', ''); // strip year for suffix building
          for (j = 0; j < combos7.length; j++) {
            folder = folderTitle + ' (' + year + ')' + combos7[j][0];
            file   = combos7[j][1];
            url    = base7 + e(folder) + '/' + e(file);
            if (!seen[url]) {
              seen[url] = 1;
              out.push({ name:'DhakaFlix '+combos7[j][2]+' '+combos7[j][3], title:t, url:url, quality:'BDIX', headers:{'User-Agent':UA} });
            }
          }
        }

        // ── SERVER 14: 1080p ──────────────────────────────────────────────
        // Structure: /English Movies (1080p)/(2026) 1080p/Title (2026) 1080p NF [Dual Audio]/file
        // Confirmed: x265 HEVC for 1080p
        var base14 = BASE14 + yf14 + '/';
        var combos14 = [
          [' 1080p NF [Dual Audio]',   ft+' 1080p NF-WEB x265 HEVC MSubs [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv',   '1080p', 'NF'   ],
          [' 1080p NF [Dual Audio]',   ft+' 1080p NF-WEB x264 MSubs [Dual Audio][Hindi 5.1+English 5.1] -mkvC.mkv',          '1080p', 'NF'   ],
          [' 1080p AMZN [Dual Audio]', ft+' 1080p AMZN-WEB x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv',  '1080p', 'AMZN' ],
          [' 1080p AMZN [Dual Audio]', ft+' UNCUT 1080p AMZN-WEB x265 HEVC ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv','1080p','AMZN'],
          [' 1080p [Dual Audio]',      ft+' REM 1080p BluRay x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -OlaM.mkv',  '1080p', 'BluRay'],
          [' 1080p [Dual Audio]',      ft+' 1080p BluRay x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -OlaM.mkv',      '1080p', 'BluRay']
        ];

        for (i = 0; i < titles7.length; i++) {
          var folderTitle14 = titles7[i].replace(' (' + year + ')', '');
          for (j = 0; j < combos14.length; j++) {
            folder = folderTitle14 + ' (' + year + ')' + combos14[j][0];
            file   = combos14[j][1];
            url    = base14 + e(folder) + '/' + e(file);
            if (!seen[url]) {
              seen[url] = 1;
              out.push({ name:'DhakaFlix '+combos14[j][2]+' '+combos14[j][3], title:t, url:url, quality:'BDIX', headers:{'User-Agent':UA} });
            }
          }
        }

        return out;
      }

      // ── TV ────────────────────────────────────────────────────────────────
      var padS = season  < 10 ? '0'+season  : ''+season;
      var padE = episode < 10 ? '0'+episode : ''+episode;
      var ep2  = 'S'+padS+'E'+padE;
      var c    = title.trim().charAt(0).toUpperCase();

      var rangePath = TV_RANGES[3].path;
      var ri;
      for (ri = 0; ri < TV_RANGES.length; ri++) {
        if (TV_RANGES[ri].test(c)) { rangePath = TV_RANGES[ri].path; break; }
      }

      var tvBase = TV_BASE + rangePath;
      var yr     = year + '\u2013';

      var showSuffixes = [
        ' (TV Series '+yr+' ) 1080p [Dual Audio]',
        ' (TV Series '+yr+' ) 720p [Dual Audio]',
        ' (TV Series '+yr+' ) 1080p',
        ' (TV Series '+yr+' ) 720p',
        ' (TV Mini Series '+yr+' ) 1080p [Dual Audio]',
        ' (TV Mini Series '+yr+' ) 720p [Dual Audio]',
        ' (TV Series '+year+')'
      ];

      var fileNames = [
        dt+'.'+ep2+'.1080p.mkv',
        dt+'.'+ep2+'.720p.mkv',
        dt+'.'+ep2+'.mkv',
        dt+'.'+ep2+'.1080p.WEBRip.x264.mkv',
        dt+'.'+ep2+'.720p.WEBRip.x264.mkv',
        dt+'.'+ep2+'.1080p.NF.WEB-DL.x264.mkv',
        dt+'.'+ep2+'.720p.NF.WEB-DL.x264.mkv'
      ];

      var tvOut = [], tvSeen = {};
      var si, fi;
      for (si = 0; si < showSuffixes.length; si++) {
        for (fi = 0; fi < fileNames.length; fi++) {
          var tvUrl = tvBase + e(title+showSuffixes[si]) + '/' + e('Season '+season) + '/' + e(fileNames[fi]);
          if (!tvSeen[tvUrl]) {
            tvSeen[tvUrl] = 1;
            var tvQ = /1080p/i.test(fileNames[fi]) ? '1080p' : '720p';
            tvOut.push({ name:'DhakaFlix TV '+tvQ, title:title+' '+ep2, url:tvUrl, quality:'BDIX', headers:{'User-Agent':UA} });
          }
        }
      }
      return tvOut;
    })
    .catch(function(err) {
      console.error('[DhakaFlix] ' + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };

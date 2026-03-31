function getStreams(tmdbId, media) {
  return [{
    name: 'DhakaFlix',
    title: 'Test Stream',
    url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/%281960-1994%29/12%20Angry%20Men%20%281957%29%20720p/12.Angry.Men.1997.720p.BluRay.x264.ESub-Pahe.mkv',
    quality: 'BDIX',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    }
  }];
}

module.exports = { getStreams: getStreams };

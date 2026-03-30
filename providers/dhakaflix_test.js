// Minimal DhakaFlix test – hardcoded for "12 Angry Men" on server 7

function getStreams(tmdbId, mediaType, season, episode) {
    // Hardcoded exact file URL from your server
    var testUrl = "http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/(1960-1994)/12%20Angry%20Men%20(1957)%20720p/12.Angry.Men.1957.720p.BluRay.x264.mkv";

    return Promise.resolve([{
        url: testUrl,
        quality: "720p",
        title: "DhakaFlix Test · 12 Angry Men",
        provider: "DhakaFlixTest"
    }]);
}

module.exports = { getStreams: getStreams };

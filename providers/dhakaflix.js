// DhakaFlix Provider Code

const DhakaFlix = () => {
    const streamMovies = () => {
        const endpoint = 'http://172.16.50.7/DHAK';
        // Logic to stream movies from the endpoint
        console.log('Streaming movies from:', endpoint);
    };

    return {
        streamMovies,
    };
};

module.exports = DhakaFlix;
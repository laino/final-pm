// sample-app.js
const cluster = require('cluster');
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
}).listen(3334, (error) => {
    if (error) {
        throw error;
    }
    process.send('ready');
});
process.on('SIGINT', () => {
    if (cluster.worker) {
        cluster.worker.disconnect();
    } else {
        process.disconnect();
        server.close();
    }
});

// sample-app.js
const cluster = require('cluster');
let listening = false;
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
}).listen(3334, (error) => {
    if (error) {
        throw error;
    }
    listening = true;
    process.send('ready');
});

process.on('SIGINT', stop);
process.on('message', (msg) => {
    if (msg === 'stop') {
        stop();
    }
});

function stop() {
    if (!listening) {
        process.exit(0);
    }
    if (cluster.worker) {
        cluster.worker.disconnect();
    } else {
        process.disconnect();
        server.close();
    }
}

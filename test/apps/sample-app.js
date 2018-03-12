/* eslint-disable no-console */
console.log('starting');

const cluster = require('cluster');
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
});
let started = false;
let shouldStop = false;

if (process.argv[2] === 'listen') {
    server.listen(3334, (error) => {
        if (error) {
            throw error;
        }
        ready();
    });
} else {
    ready();
}

process.on('SIGINT', stop);
process.on('message', (msg) => {
    if (msg === 'stop') {
        stop();
    }
});

function ready() {
    started = true;
    if (shouldStop) {
        stop();
    }
    process.send('ready');
    console.log('ready');
}

function stop() {
    shouldStop = true;
    if (!started) {
        return;
    }
    console.log('stopping');
    server.close(() => {
        if (!process.connected) {
            process.exit(0);
        }
        if (cluster.worker) {
            cluster.worker.disconnect();
        } else {
            process.disconnect();
        }
    });
}

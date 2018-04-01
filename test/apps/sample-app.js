/* eslint-disable no-console */
console.log('starting');

const cluster = require('cluster');
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
});
let started = false;
let shouldStop = false;
let stopping = false;

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

process.on('disconnect', stop);
process.on('SIGINT', stop);
process.on('message', (msg) => {
    if (msg === 'stop') {
        stop();
    }
});

function ready() {
    started = true;
    process.send('ready');
    console.log('ready');
    if (shouldStop) {
        stop();
    }
}

function stop() {
    shouldStop = true;
    if (!started) {
        return;
    }
    if (stopping) {
        return;
    }

    stopping = true;
    console.log('stopping');

    if (process.argv[2] === 'listen') {
        server.close(doStop);
    } else {
        doStop();
    }

    function doStop() {
        if (!process.connected) {
            process.exit(0);
        }
        if (cluster.worker) {
            cluster.worker.disconnect();
        } else {
            process.disconnect();
        }
    }
}

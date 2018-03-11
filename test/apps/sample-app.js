// sample-app.js
console.log('starting');

const cluster = require('cluster');
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
});
let started = false;
let shouldStop = false;

process.stdout.write('TWO LINES\r\nAT ONCE\r\n');
process.stdout.write('A LINE IN');
setTimeout(() => {
    process.stdout.write(' TWO PARTS\r\n');

    server.listen(3334, (error) => {
        if (error) {
            throw error;
        }
        started = true;
        if (shouldStop) {
            stop();
        }
        process.send('ready');
        console.log('ready');
    });
}, 50);

process.on('SIGINT', stop);
process.on('message', (msg) => {
    if (msg === 'stop') {
        stop();
    }
});

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

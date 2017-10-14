const fs = require('fs');
const path = require('path');

const outfile = path.resolve(process.argv[2]);
const ws = fs.createWriteStream(outfile);

process.on('message', (message) => {
    const app = message.app;
    const streamName = message.stream; // STDOUT or STDERR
    const date = new Date(message.timestamp);

    // Ignore our own output. There shouldn't be any anyways.
    if (app === 'file-logger' && streamName === 'STDOUT') {
        return;
    }

    message.data.split('\n').forEach((line) => {
        ws.write(`${app}:${streamName}:${date.toISOString()}: ${line}`);
    });
});

process.on('SIGINT', () => {
    ws.end();       
});

process.send('ready');

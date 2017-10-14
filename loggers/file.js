const fs = require('fs');
const path = require('path');

const outfile = path.resolve(process.argv[2]);
const ws = fs.createWriteStream(outfile);

process.on('message', (message) => {
    const app = message.app;
    const streamName = message.stream; // STDOUT or STDIN
    const line = message.line.replace(/\n/g, '\\n');

    ws.write(`${app}:${streamName}: ${line}`);
});

process.on('SIGINT', () => {
    ws.end();       
});

process.send('ready');

const fs = require('fs');
const path = require('path');

const outfile = path.resolve(process.argv[2] || 'log.txt');
const ws = fs.createWriteStream(outfile, {flags: 'a'});

process.on('message', (message) => {
    const app = message.app;
    const date = new Date(message.timestamp);

    ws.write(`[${date.toISOString()}] [${app}/${message.process.number} ` +
             `${message.process.pid}] [${message.type.toUpperCase()}]: ${message.text}\n`);
});

process.on('SIGINT', () => {
    process.disconnect();
});

process.on('disconnect', () => {
    ws.end();
});

process.send('ready');

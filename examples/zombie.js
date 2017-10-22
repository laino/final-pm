process.send('ready');

process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});
process.on('exit', () => {});

/* eslint-disable no-console */

process.send('ready');

setInterval(() => {
    console.log('1234567890');
}, 1);

process.on('message', (msg) => {
    if (msg === 'stop')
        process.exit(0);
});

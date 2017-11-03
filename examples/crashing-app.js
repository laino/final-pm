setTimeout(() => {
    process.exit(1);
}, Math.floor(Math.random() * 2000));
// Sometimes we are ready before crash...
setTimeout(() => {
    process.send('ready');
}, Math.floor(Math.random() * 2000));

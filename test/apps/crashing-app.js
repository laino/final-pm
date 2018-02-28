setTimeout(() => {
    console.error('whoops!');
    process.exit(1);
}, Math.floor(Math.random() * 1000));
// Sometimes we are ready before crash...
setTimeout(() => {
    process.send('ready');
}, Math.floor(Math.random() * 1000));

// sample-app.js
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
}).listen(3333, (error) => {
    if (error) throw error;

    console.log("Process started, telling master we are ready...");
    if (process.send)
        process.send('ready');
});

process.on('SIGINT', () => {
    console.log("SIGINT received. Performing clean shutdown...");
    server.close();
});

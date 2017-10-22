// sample-app.js
const cluster = require('cluster');
const server = require('http').createServer((req, res) => {
    res.end(process.argv.join(' ')); // Reply with process arguments
}).listen(3334, (error) => {
    if (error) {
        throw error;
    }
    console.log("Process started, telling master we are ready...");
    process.send('ready');
});
process.on('SIGINT', () => {
    console.log("SIGINT received. Performing clean shutdown...");
    // Implicitly calls server.close, then disconnects the IPC channel: 
    cluster.worker.disconnect(); 
});

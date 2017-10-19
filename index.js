
exports.daemon = require('./lib/daemon');
exports.client = require('./lib/client');
exports.config = require('./lib/config');

exports.registerProcessHandlers = () => {
    process.on('unhandledRejection', (error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
};

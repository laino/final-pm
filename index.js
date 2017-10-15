
exports.Daemon = require('./lib/daemon');
exports.Client = require('./lib/client');
exports.config = require('./lib/config');

exports.registerProcessHandlers = () => {
    process.on('unhandledRejection', (error) => {
        throw error;
    });
};

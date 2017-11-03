
exports.daemon = require('./lib/daemon');
exports.client = require('./lib/client');
exports.config = require('./lib/config');

exports.registerProcessHandlers = () => {
    process.on('unhandledRejection', (error) => {
        console.error(error.stack || error); // eslint-disable-line no-console
        process.exit(1);
    });
};

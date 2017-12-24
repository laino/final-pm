
module.exports = {
    daemon: require('./lib/daemon'),
    client: require('./lib/client'),
    config: require('./lib/config'),

    registerProcessHandlers() {
        process.on('unhandledRejection', (error) => {
            console.error(error.stack || error); // eslint-disable-line no-console
            process.exit(1);
        });
    }
};


module.exports = {
    daemon: require('./lib/daemon'),
    client: require('./lib/client'),
    config: require('./lib/config'),

    registerProcessHandlers() {
        process.on('unhandledRejection', (error) => {
            throw error;
        });
    }
};

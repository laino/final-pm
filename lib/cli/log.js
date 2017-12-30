const cli = require('./index.js');

module.exports = (info, args) => {
    const apps = new Set(args.select.map((selector) => selector.app));

    if (apps.has('all')) {
        apps.clear();
        apps.add('all');
    }

    return apps.values().map((appName) => {
        return {
            name: 'logs',
            args: [appName, {
                follow: cli.args.follow
            }]
        };
    });
};

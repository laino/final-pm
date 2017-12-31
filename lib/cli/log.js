const cli = require('./index.js');

module.exports = async (info, args, client) => {
    const apps = new Set(args.select.map((selector) => selector.app));

    if (apps.has('all')) {
        apps.clear();
        apps.add('all');
    }

    const logs = await client.invoke('all', Array.from(apps).map((appName) => {
        return {
            name: 'logs',
            args: [appName, {
                follow: cli.args.follow
            }]
        };
    }));

    logs.forEach((logs) => {
        logs.slice(-args.lines).forEach(cli.appLog);
    });

    return [];
};

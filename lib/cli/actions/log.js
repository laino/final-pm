const cli = require('../index.js');

module.exports = async (info, args, client) => {
    const apps = new Set(args.select.map((selector) => selector.app));

    if (apps.has('all')) {
        apps.clear();
        apps.add('all');
    }

    const logs = await client.invoke('all', Array.from(apps).map((appName) => {
        const cmdArgs = [appName, {
            follow: cli.args.follow,
            lines: args.lines
        }];

        cli.debugCommand("logs", cmdArgs);

        return {
            name: 'logs',
            args: cmdArgs
        };
    }));

    logs.results.forEach((logs) => {
        logs.lines.forEach(cli.appLog);
    });

    return [];
};

const cli = require('../index.js');

module.exports = (info, args) => {
    const actions = [];

    for (const selector of args.select) {
        if (!selector.app)
            continue;

        const apps = info.applications.filter(app => {
            return app.type === 'application' &&
                   (app.name === selector.app || selector.app === 'all');
        });

        if (apps.length === 0) {
            cli.err("Selector", `No such application: {bold ${selector.app}}`);
            continue;
        }

        for (const app of apps) {
            if (typeof selector.number === 'number') {
                actions.push({
                    name: 'start',
                    args: [app.name, {
                        number: selector.number
                    }]
                });
                continue;
            }

            for (var i = 0; i < app.instances; i++) {
                actions.push({
                    name: 'start',
                    args: [app.name, {
                        number: i
                    }]
                });
            }
        }
    }

    return actions;
};

module.exports.upload = true;

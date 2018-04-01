const cli = require('../index.js');

module.exports = (info, args) => {
    const selected = cli.filterInfo(info, args.select);
    const actions = [];

    for (const app of selected.applications) {
        actions.push({
            name: 'delete',
            args: [app.name]
        });
    }

    return actions;
};

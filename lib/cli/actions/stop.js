const cli = require('../index.js');

module.exports = (info, args) => {
    const selected = cli.filterInfo(info, args.select);
    const actions = [];
    const actionName = args.action;

    for (const process of selected.processes) {
        actions.push({
            name: actionName,
            args: [process.id]
        });
    }

    return actions;
};

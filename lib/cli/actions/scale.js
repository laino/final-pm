const cli = require('../index.js');

module.exports = (info, args) => {
    const selected = cli.filterInfo(info, args.select);
    const actions = [];

    function procFilter(app) {
        return (proc) => {
            return proc['app-name'] === app.name &&
                   ['queue', 'new', 'running'].includes(proc['generation']);
        };
    }

    for (const app of selected.applications) {
        const running = selected.processes.filter(procFilter(app))
            .sort((a, b) => a.number - b.number);


        let number = running.length;
        const max = app['instances'];

        for (; number > max; number--) {
            actions.push({
                name: 'stop',
                args: [running[number - 1].id]
            });
        }

        for (let i = 0; i < max; i++) {
            if (running.find(proc => proc.number === i))
                continue;

            actions.push({
                name: 'start',
                args: [app.name, {
                    number: i
                }]
            });
        }
    }

    return actions;
};

module.exports.upload = true;

const cli = require('../index.js');

const HIDDEN_APP_KEYS = {
    env: true
};

const HIDDEN_PROCESS_KEYS = {
    app: {
        env: true
    }
};

module.exports = (info, args) => {
    const selected = cli.filterInfo(info, args.select, {
        implicitLoggers: cli.args.verbose,
        exact: true
    });

    for (const app of selected.applications) {
        printThing(app['name'], app, cli.args.verbose ? {} : HIDDEN_APP_KEYS);
    }

    for (const proc of selected.processes) {
        const type = `${proc['generation']}:${proc['app-name']}/${proc['number']}`;
        printThing(type, proc, cli.args.verbose ? {} : HIDDEN_PROCESS_KEYS);
    }
};

function printThing(type, obj, hide = {}) {
    cli.reply(type, `{bold ${type}} = {`);
    printObject(type, '  ', obj, hide);
    cli.reply(type, `}`);
}

function printObject(type, prefix, obj, hide = {}) {
    const isArray = obj instanceof Array;

    for (const [key, value] of Object.entries(obj)) {
        let pre = prefix;

        if (!isArray) {
            pre += `{yellow ${key}}: `;
        }

        if (typeof value === 'object' && value !== null) {
            const braces = value instanceof Array ? ['[',']'] : ['{', '}'];

            pre += braces[0];

            if (isObjectEmpty(value)) {
                cli.reply(type, `${pre}${braces[1]}`);
                continue;
            }

            if (hide[key] === true) {
                cli.reply(type, `${pre} {gray ...} ${braces[1]}`);
                continue;
            }

            cli.reply(type, pre);
            printObject(type, prefix + '  ', value, hide[key]);
            cli.reply(type, `${prefix}${braces[1]}`);
            continue;
        }

        cli.reply(type, `${pre}{blue ${formatValue(value)}}`);
    }
}

function isObjectEmpty(obj) {
    return Array.from(Object.values(obj)).length === 0;
}

function formatValue(val) {
    return JSON.stringify(val);
}

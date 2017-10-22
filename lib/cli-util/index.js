/* eslint-disable no-console */

const table = require('table');
const stripAnsi = require('strip-ansi');
const ansi = require('ansi-escape-sequences');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const argsDefinition = require('../../cli-args.js');

exports.args = null;

exports.parseArgs = function() {
    let args;
    try {
        args = exports.args = commandLineArgs(argsDefinition.options, {
            partial: false,
            disableGreedyMultiple: true
        });
    } catch (e) {
        exports.invalidArgument(e.message);
    }

    ['usage', 'generations', 'example', 'configuration', 'all', 'help']
        .forEach((page) => {
            if (args['help-' + page]) {
                console.log(commandLineUsage(argsDefinition[page]));
                process.exit(0);
            }
        });

    if (args.actionSelect.length === 0 && !args.kill && !args.launch && !args.force) {
        console.log(commandLineUsage(argsDefinition.help));
        process.exit(0);
    }

    if (args.actionSelect.length === 1) {
        exports.invalidArgument("Missing option: Selector is missing.");
    }
        
    args.action = null;
    args.select = [];
    if (args.actionSelect.length > 1) {
        if (!argsDefinition.isKnownAction(args.actionSelect[0])) {
            exports.invalidArgument("Unknown action: " + args.actionSelect[0]);
        }

        args.action = args.actionSelect[0];
        args.select = exports.parseSelectors(args.actionSelect.slice(1));
    }
};

exports.capitalize = function(string) {
    return string.slice(0, 1).toUpperCase() + string.slice(1);
}

exports.invalidConfig = function(path, ...info) {
    exports.err("Configuration", path, ...info);
    exports.err("Configuration", "Check \"final-pm --help\" for example configurations.");
    process.exit(1);
};

exports.invalidArgument = function(...info) {
    exports.err("Arguments", ...info);
    exports.err("Arguments", "Check \"final-pm --help\" for the correct syntax.");
    process.exit(1);
};


exports.debug = function(...out) {
    if (!exports.args.verbose) return;

    console.log(makeLogLine(
        ['[gray]{DEBUG}'].concat(out),
        process.stdout.isTTY
    ));
};

exports.reply = function(...args) {
    console.log(makeLogLine(
        ['[green]{REPLY}'].concat(args),
        process.stdout.isTTY
    ));
};

exports.log = function(...args) {
    console.log(makeLogLine(
        ['[white]{INFO }'].concat(args),
        process.stdout.isTTY
    ));
};

exports.err = function(...args) {
    console.error(makeLogLine(
        ['[red]{ERROR}'].concat(args),
        process.stderr.isTTY
    ));
};

exports.table = function (data, options = {}) {
    data = data.map((line) => {
        return line.map((cell) => {
            return ansi.format(String(cell));
        });
    });

    return table.table(data, options);
};

function makeLogLine(args, format) {
    const last = args[args.length - 1];
    const pre = `[[bold]{${args.slice(0, args.length - 1).join('}] [[bold]{')}}] `;
    const line = ansi.format(last.split('\n').map(line => pre + line).join('\n'));
    
    if (format) {
        return line;
    }

    return stripAnsi(line);
}

//                          [gen]:        pid=[pid]    |   id=[id]     | [app]   / [n]
const selectorRegExp = /^(?:(\w+):)?(?:(?:pid=([0-9]+))|(?:id=([0-9]+))|(\w+)(?:\/([0-9]+))?)$/;
exports.parseSelectors = function(selectors) {
    return selectors.map((selector) => {
        const result = selectorRegExp.exec(selector);
        if (!result) {
            exports.invalidArgument("Unknown selector: " + selector);
        }

        let [gen, pid, id, app, number] = result.slice(1);

        if (typeof number === 'string') {
            number = Number(number);

            if (isNaN(number)) {
                exports.invalidArgument("Unknown selector: " + selector);
            }
        }
        
        if (typeof pid === 'string') {
            pid = Number(pid);

            if (isNaN(pid)) {
                exports.invalidArgument("Unknown selector: " + selector);
            }
        }
        
        if (typeof id === 'string') {
            id = Number(id);

            if (isNaN(id)) {
                exports.invalidArgument("Unknown selector: " + selector);
            }
        }

        return { gen, pid, id, app, number };
    });
};

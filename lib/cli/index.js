"use strict";
/* eslint-disable no-console */

const ansiTable = require('table');
const ansi = require('ansi-escape-sequences');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const argsDefinition = require('../../cli-args.js');
const logging = require("./logging");

Object.assign(exports, logging);

exports.ACTIONS = {
    'start': require('./start.js'),
    'restart': require('./start.js'),
    'add': require('./add.js'),
    'delete': require('./delete.js'),
    'stop': require('./stop.js'),
    'kill': require('./stop.js'),
    'scale': require('./scale.js'),
    'show': require('./show.js'),
    'log': require('./log.js'),
};

exports.args = null;

exports.parseArgs = function() {
    let args;
    try {
        args = exports.args = commandLineArgs(argsDefinition.options, {
            partial: false,
            disableGreedyMultiple: true
        });
        logging.verbose = args.verbose;
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

    if (args.actionSelect.length === 0 && !args.kill && !args.launch && !args.force && !args.wait) {
        console.log(commandLineUsage(argsDefinition.help));
        process.exit(0);
    }


    if (args.actionSelect.length === 1) {
        if (['show', 'log'].includes(args.actionSelect[0])) {
            args.actionSelect.push('all');
        } else {
            exports.invalidArgument("Missing option: Selector is missing.");
        }
    }

    args.action = null;
    args.select = [];
    if (args.actionSelect.length > 1) {
        if (!argsDefinition.isKnownAction(args.actionSelect[0])) {
            exports.invalidArgument(`Unknown action: [bold]{${args.actionSelect[0]}}\nValid actions are: ` +
                                    `[bold]{${argsDefinition.knownActions.join(', ')}}`);
        }

        args.action = args.actionSelect[0];
        args.select = exports.parseSelectors(args.actionSelect.slice(1));
    }
};

exports.capitalize = function(string) {
    return string.slice(0, 1).toUpperCase() + string.slice(1);
};

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

exports.debugCommand = function(name, args) {
    args = (args || []).map((arg) => {
        return JSON.stringify(arg).replace(/}/g, '\\}');
    }).join(', ');

    exports.debug("Command", `[bold]{${name}}(${args})`);
};

exports.table = function(data, options = {}) {
    data = data.map((line) => {
        return line.map((cell) => {
            return ansi.format(String(cell));
        });
    });

    return ansiTable.table(data, options);
};

//                          [gen]:        pid=[pid]    |   id=[id]     | [app]       / [n]
const selectorRegExp = /^(?:(\w+):)?(?:(?:pid=([0-9]+))|(?:id=([0-9]+))|([\w_-]+)(?:\/([0-9]+))?)$/;

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

exports.filterInfo = function(info, selectors, includeImplicitLoggers = false) {
    const applications = info.applications.filter((app) => {
        for (const select of selectors) {
            if (typeof select.pid === 'number' ||
                typeof select.id === 'number' ||
                typeof select.number === 'number')
                continue;

            if (select.app === app.name ||
                select.app === 'all' && (app.type !== 'logger' || includeImplicitLoggers))
                return true;
        }

        return false;
    });

    const processes = info.processes.filter(processFilter);

    function processFilter(process) {
        for (const select of selectors) {
            if (select.gen && select.gen !== process['generation'])
                continue;

            const app = process.app ||
                info.applications.find((app) => app['name'] === process['app-name']);

            if (select.app && select.app === 'all' ?
                app.type === 'logger' && !includeImplicitLoggers :
                select.app !== process['app-name'])
                continue;

            if (!match('number', select, process) ||
                !match('id', select, process) ||
                !match('pid', select, process)) {

                continue;
            }

            return true;
        }

        return false;
    }

    function match(name, select, process) {
        return typeof select[name] === 'undefined' || select[name] === process[name];
    }

    return {
        applications,
        processes,
    };
};

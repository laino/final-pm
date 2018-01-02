
const {EventEmitter} = require('events');
const {Server} = require('final-rpc');

const equal = require('deep-equal');
const path = require('path');
const stableSort = require('stable');
const Generations = require('./generations.js');
const Process = require('./process.js');
const Logger = require('./logger.js');
const config = require('../config');

class Daemon extends EventEmitter {
    constructor() {
        super();

        this.rpcServer = new Server();

        this.configCounter = 0;
        this.waiting = [];

        this.exposed = wrapRPCMethods(this,
            'add', 'delete', 'killDaemon',
            'info', 'wait', 'all',
            'start', 'stop',
            'kill', 'logs'
        );
        this.rpcServer.register(this.exposed);

        this.applications = new Map();
        this.processes = new Map();
        this.loggers = new Map();

        this.generations = new Generations(this);
        this.processEvents = processEvents(this);

        Object.seal(this);
    }

    start(appName, options) {
        return !!this.spawn(appName, options);
    }

    add(app, options = {}) {
        const old = this.applications.get(app.name);
        const result = compareApplicationRevisions(old, app, options.force);

        if ((result.added || result.changed.length) && result.success) {
            app.revision = this.configCounter++;

            Object.freeze(app);

            this.applications.set(app.name, app);
        }

        return result;
    }

    delete(appName) {
        if (this.applications.has(appName)) {
            this.applications.delete(appName);
            return true;
        }

        return false;
    }

    stop(options) {
        const process = this.processes.get(options.id);

        if (process) {
            process.stop();
        }
    }

    kill(options) {
        const process = this.processes.get(options.id);

        if (process) {
            process.kill();
        }
    }

    logs(appName, options, client) {
        if (options.follow) {
            this.rpcServer.subscribe(client, 'log-' + appName);
        }

        let lines = [];

        for (const logger of this.loggers.values()) {
            if (appName === 'all') {
                for (const logs of logger.logs.values()) {
                    lines = lines.concat(logs.lines);
                }
            } else if (logger.logs.has(appName)) {
                lines = lines.concat(logger.logs.get(appName).lines);
            }
        }

        return stableSort(
            lines.map((line) => line.data),
            (a, b) => a.timestamp - b.timestamp);
    }

    async all(actions, client) {
        const results = [];

        for (const action of actions) {
            const {name, args = []} = action;

            if (!Object.prototype.hasOwnProperty.call(this.exposed, name) === -1) {
                results.push();
                continue;
            }

            let result = this.exposed[name](client, ...args);

            if (typeof result !== 'object' ||
                typeof result.then !== 'function') {

                result = Promise.resolve(result);
            }

            results.push(result);

            // Wait gets special treatment
            if (name === 'wait') {
                await Promise.all(results);
            }
        }

        return await Promise.all(results);
    }

    spawnCopy(process) {
        const app = process.app;

        this.spawn(app, {
            id: process.id,
            startDelay: app['restart-crashing-delay'],
            crashCounter: process.crashCounter + 1,
            number: process.number,
            args: process.args,
            cwd: process.cwd
        });
    }

    spawn(app, options) {
        if (typeof app === 'string') {
            app = this.applications.get(app);

            if (!app) {
                return null;
            }
        }

        const process = new Process(app, options);
        const logger = this.getLogger(process);

        this.processes.set(process.id, process);

        for (let [name, listener] of Object.entries(this.processEvents)) {
            process.on(name, listener);
        }

        process.move(this.generations.new);

        if (logger) {
            logger.addProcess(process);
        }

        return process;
    }

    getLogger(process) {
        if (!process.loggerKey) {
            return;
        }

        let logger = this.loggers.get(process.loggerKey);

        if (logger) {
            return logger;
        }

        logger = new Logger(this, process.loggerKey);

        logger.on('inactive', () => {
            this.loggers.delete(process.loggerKey);
        });

        logger.on('line', (line) => {
            const appName = line.data.app;
            this.rpcServer.publish('log-' + appName, line.data);
            this.rpcServer.publish('log-all', line.data);
        });

        this.loggers.set(process.loggerKey, logger);

        return logger;
    }

    checkWaiting() {
        const {new: newGen, old, marked} = this.generations;

        if (newGen.isEmpty() && old.isEmpty() && marked.isEmpty()) {
            this.waiting.splice(0).forEach((cb) => cb());
        }
    }

    log(...args) {
        console.log(args.join(' ')); // eslint-disable-line no-console
    }

    err(...args) {
        console.error(args.join(' ')); // eslint-disable-line no-console
    }

    info() {
        const processes = {};

        for (let key of Object.keys(this.generations)) {
            const proclist = Array.from(this.generations[key].processes());

            processes[key] = proclist.map((process) => {
                const app = process.app;
                const result = {
                    'id': process.id,
                    'pid': process.pid,
                    'number': process.number,
                    'args': process.args,
                    'cwd': process.cwd,
                    'crashes': process.crashCounter,
                    'killing': process.killing,
                    'app-name': app.name,
                    'start-time': new Date(process.startTime)
                };

                if (app !== this.applications.get(app.name)) {
                    result['app'] = app;
                }

                return result;
            });
        }

        return {
            applications: Array.from(this.applications.values()),
            processes
        };
    }

    async wait() {
        return new Promise((fulfill) => {
            this.waiting.push(fulfill);

            this.checkWaiting();
        });
    }

    async listen(socket) {
        await this.loadBuiltins();
        await this.rpcServer.listen(socket);

        this.emit('listen');
    }

    async loadBuiltins() {
        const loggerConfig =
            await config.getConfig(path.resolve(__dirname, '../../loggers/process-config.json'));

        await Promise.all(loggerConfig.applications.map(_ => this.add(_)));
    }

    async close() {
        await this.rpcServer.close();

        this.emit('close');
    }

    async killDaemon() {
        this.close();

        for (const proc of this.processes.values()) {
            proc.kill('SIGKILL', true);
        }

        this.emit('kill');
    }
}

function processEvents(daemon) {
    return {
        move() {
            daemon.checkWaiting();
        },
        exit() {
            // Might've already been replaced...
            if (daemon.processes.get(this.id) === this) {
                daemon.processes.delete(this.id);
            }

            daemon.checkWaiting();
        }
    };
}

function compareApplicationRevisions(old, app, force) {
    const result = {
        changed: [],
        added: false,
        success: true,
        reason: null
    };

    if (!old) {
        result.added = true;
        return result;
    }

    const appCopy = Object.assign({}, app, {
        revision: old.revision
    });

    if (old.builtin && !force) {
        result.reason = 'builtin';
        result.success = false;
        return result;
    }

    if (equal(old, appCopy)) {
        return result;
    }

    if (old['config-path'] !== appCopy['config-path'] && !force) {
        result.reason = 'path';
        result.success = false;
        return result;
    }

    const keys = new Set([...Object.keys(old), ...Object.keys(appCopy)]);

    for (const key of keys) {
        if (!equal(old[key], appCopy[key])) {
            result.changed.push(key);
        }
    }

    return result;
}

function wrapRPCMethods(daemon, ...methods) {
    const exposed = {};

    methods.forEach(method => {
        const fn = daemon[method].bind(daemon);

        const wrapped = async (client, ...args) => {
            try {
                const result = await fn(...args, client);

                if (typeof result === 'boolean') {
                    return {success: result};
                }

                if (typeof result === 'undefined') {
                    return {success: true};
                }

                return result;
            } catch (error) {
                setImmediate(() => {
                    // Escape noice rpc error handler.
                    // We actually want to crash with any error.
                    throw error;
                });

                return {success: false};
            }
        };

        exposed[method] = wrapped;
    });

    return exposed;
}

module.exports = Daemon;

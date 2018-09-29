
const {EventEmitter} = require('events');
const {Server} = require('final-rpc');

const WebSocket = require('final-rpc').WebSocket;
const finalPM = require('../../index.js');
const equal = require('deep-equal');
const path = require('path');
const stableSort = require('stable');
const Generations = require('./generations.js');
const Process = require('./process.js');
const Logger = require('./logging.js');
const API = require('./api.js');
const config = require('../config');

class Daemon extends EventEmitter {
    constructor() {
        super();

        this.rpcServer = new Server();
        this.configCounter = 0;
        this.idCounter = 0;
        this.listening = false;
        this.waiting = [];
        this.allWaiting = [];
        this.applications = new Map();
        this.processes = new Map();
        this.loggers = new Map();

        this.generations = new Generations(this);
        this.dummyLogger = new DummyLogger(this);

        this.apiCalls = API.from(this, new DaemonAPI());

        this.rpcServer.register(wrapRPCMethods(this.apiCalls));

        for (const [key, fn] of Object.entries(this.apiCalls)) {
            /* istanbul ignore if */
            if (Object.prototype.hasOwnProperty.call(this, key)) {
                throw new Error(`API call ${key} would overwrite existing property ${key}`);
            }

            this[key] = fn;
        }

        this.rpcServer.on('error', this._onError.bind(this));

        Object.seal(this);
    }

    _onError(error) {
        this.emit('error', error);
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

        if (!Object.prototype.hasOwnProperty.call(options, 'id')) {
            options = Object.assign({}, options);
            options.id = this.idCounter++;
        }

        const process = new Process(app, options);
        const logger = this.getLogger(process);

        this.processes.set(process.id, process);

        logger.addProcess(process);

        const events = createProcessEventListeners(this, logger);

        for (let [name, listener] of Object.entries(events)) {
            process.on(name, listener);
        }

        process.move(this.generations.queue);

        return process;
    }

    getLogger(process) {
        if (!process.loggerKey) {
            return this.dummyLogger;
        }

        let logger = this.loggers.get(process.loggerKey);

        if (logger) {
            return logger;
        }

        logger = new Logger(this, process.loggerKey);

        logger.on('resting', () => {
            this.checkWaiting();
        });

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
        for (const process of this.processes.values()) {
            if (process.generation !== this.generations.running)
                return;
        }

        for (const logger of this.loggers.values()) {
            if (!logger.isAtRest())
                return;
        }

        let completed = this.waiting.splice(0);

        if (this.processes.size === 0) {
            completed = completed.concat(this.allWaiting.splice(0));
        }

        completed.forEach((resolve) => {
            resolve({success: true});
        });
    }

    async listen(socket) {
        this.listening = true;

        await this.rpcServer.listen(socket);

        this.emit('listen');
    }

    async loadBuiltins() {
        const loggerConfig =
            await config.getConfig(path.resolve(__dirname, '../../loggers/process-config.json'));

        await Promise.all(loggerConfig.applications.map(_ => this.add(_)));
    }

    async close() {
        this.listening = false;

        await this.rpcServer.close();

        this.emit('close');
    }
}

/*
 * Public API.
 *
 * These also will become functions on the Daemon instance.
 * See api.js for the API definition / validation.
 *
 */
class DaemonAPI {
    add(app, options = {}) {
        if (options instanceof WebSocket) {
            options = {};
        }

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

            return {success: true};
        }

        return {success: false};
    }

    start(appName, options = {}) {
        if (options instanceof WebSocket) {
            options = {};
        }

        const process = this.spawn(appName, options);

        if (!process) {
            return {success: false};
        }

        return {
            success: true,
            process: processData(this, process)
        };
    }

    stop(id) {
        const process = this.processes.get(id);

        if (process) {
            process.stop();

            return {success: true};
        }

        return {success: false};
    }

    kill(id) {
        const process = this.processes.get(id);

        if (process) {
            process.kill();

            return {success: true};
        }

        return {success: false};
    }

    send(id, message) {
        return new Promise((resolve, reject) => {
            const process = this.processes.get(id);

            if (!process) {
                resolve({success: false});
                return;
            }

            process.send(message, (error) => {
                if (error) {
                    process.handleError(error);
                    reject(new API.APIError(error.message));
                    return;
                }

                resolve({success: true});
            });
        });
    }

    info() {
        const processes = Array.from(this.processes.values())
            .map(processData.bind(null, this));

        return {
            success: true,
            applications: Array.from(this.applications.values()),
            processes,
            version: finalPM.version,
            nodeVersion: process.version
        };
    }

    wait(all) {
        if (all instanceof WebSocket) {
            all = false;
        }

        return new Promise((fulfill) => {
            const list = all ? this.allWaiting : this.waiting;

            list.push(fulfill);

            this.checkWaiting();
        });
    }

    logs(appName, options = {}, client) {
        if (options instanceof WebSocket) {
            client = options;
            options = {};
        }

        if (options.follow && client) {
            this.follow(appName, client);
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

        lines = stableSort(
            lines.map((line) => line.data),
            (a, b) => a.timestamp - b.timestamp);

        if (typeof options.lines === 'number') {
            lines = lines.slice(-options.lines);
        }

        return {
            lines,
            success: true
        };
    }

    follow(appName, client) {
        if (client) {
            this.rpcServer.subscribe(client, 'log-' + appName);
        }

        return {success: true};
    }

    unfollow(appName, client) {
        if (client) {
            this.rpcServer.unsubscribe(client, 'log-' + appName);
        }

        return {success: true};
    }

    async killDaemon() {
        if (this.listening) {
            this.close().catch(this._onError.bind(this));
        }

        for (const proc of this.processes.values()) {
            if (proc.app['type'] !== 'logger') {
                proc.kill('SIGKILL', true);
            }
        }

        for (const logger of this.loggers.values()) {
            logger.kill();
        }

        await this.wait(true);

        this.emit('kill');

        return {success: true};
    }

    async all(actions, client) {
        const results = [];

        for (const action of actions) {
            const {name, args = []} = action;

            let result = this[name](...args, client);

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

        return {
            results: await Promise.all(results),
            success: true
        };
    }
}

/*
 * Dummy logger for logger processes' output.
 */
class DummyLogger {
    constructor(daemon) {
        this.daemon = daemon;

        Object.seal(this);
    }

    log(process, type, text) {
        this.daemon.emit('logger-output', process.toString(), type, text);
    }

    pushLine(process, stream, line) {
        this.log(process.toString(), stream, line);
    }

    addProcess() {}
    removeProcess() {}
}

function createProcessEventListeners(daemon, logger) {
    const events = {
        error(error) {
            logger.log(this, 'error', error.message + '\n' + error.stack, {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });
        },
        move(gen) {
            logger.log(this, 'moved', `moved to ${gen.name} generation`);

            setImmediate(() => {
                daemon.checkWaiting();
            });
        },
        timeout(type) {
            logger.log(this, type + '-timeout', type + ' timeout');
        },
        signal(signal, type) {
            logger.log(this, type, `signal=${signal}`);
        },
        start() {
            logger.log(this, 'start', `starting`);
        },
        exit(code, signal) {
            logger.log(this, 'exit', `code=${code} signal=${signal}`);
            logger.removeProcess(this);

            for (let [name, listener] of Object.entries(events)) {
                this.removeListener(name, listener);
            }

            // Might've already been replaced...
            if (daemon.processes.get(this.id) === this) {
                daemon.processes.delete(this.id);
            }

            setImmediate(() => {
                daemon.checkWaiting();
            });
        },
        output(stream, line, truncatedBytes) {
            logger.pushLine(this, stream, line, truncatedBytes);
        }
    };

    return events;
}

function processData(daemon, process) {
    const app = process.app;

    const result = {
        'id': process.id,
        'pid': process.pid,
        'number': process.number,
        'args': process.args,
        'cwd': process.cwd,
        'crashes': process.crashCounter,
        'killing': process.killing,
        'started': process.started,
        'app-name': app.name,
        'generation': process.generation.name,
        'start-time': new Date(process.startTime),
        'create-time': new Date(process.createTime),
    };

    if (app !== daemon.applications.get(app.name)) {
        result['app'] = app;
    }

    return result;
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

function wrapRPCMethods(impl) {
    const result = {};

    for (const [key, fn] of Object.entries(impl)) {
        result[key] = function(client, ...args) {
            let result;

            try {
                result = fn(...args, client);
            } catch (error) {
                handleRPCError(error);
            }

            if (typeof result !== 'object' || typeof result.then !== 'function') {
                return result;
            }

            return result.catch(handleRPCError);
        };
    }

    return result;
}

function handleRPCError(error) {
    /* istanbul ignore if: handle programmer errors */
    if (!(error instanceof API.APIError)) {
        setImmediate(() => {
            // Escape RPC Error handler.
            // We actually want to crash with any unhandled error.
            throw error;
        });
        return;
    }

    throw error;
}

module.exports = Daemon;

const EventEmitter = require('events').EventEmitter;
const ws = require('ws');
const equal = require('deep-equal');
const http = require('http');
const url = require('url');
const util = require('util');
const rpc = require('noice-json-rpc');
const Generations = require('./generations.js');
const Process = require('./process.js');

class Daemon extends EventEmitter {
    constructor() {
        super();

        this.httpServer = new http.Server();
        this.wsServer = new ws.Server({server: this.httpServer});
        this.rpcServer = new rpc.Server(this.wsServer);
        this.api = this.rpcServer.api();
        this.exposed = {};

        // FIXME validate arguments
        this.expose(
            'load', 'kill',
            'info', 'wait', 'all',
            'startProcess', 'stopProcess',
            'killProcess'
        );

        this.applications = new Map();
        this.processes = new Map();

        this.generations = new Generations(this);

        Object.seal(this);
    }

    expose(...args) {
        args.forEach(arg => {
            this.exposed[arg] = async (...args) => {
                try {
                    const result = await this[arg](...args);

                    if (typeof result === 'boolean') {
                        return {success: result};
                    }
                    
                    if (typeof result === 'undefined') {
                        return true;
                    }

                    return result;
                } catch (error) {
                    setImmediate(() => {
                        // FIXME escape noice rpc error handler:
                        throw error;
                    });
                    return {success: false};
                }
            };
        });

        this.api.Daemon.expose(this.exposed);
    }
    
    load(args) {
        const [app, force] = args;

        const old = this.applications.get(app.name);

        if (old) {
            app.revision = old.revision;

            if (equal(old, app)) {
                return {success: true};
            }

            if (old['config-path'] !== app['config-path'] && !force) {
                return {
                    reason: 'path',
                    success: false
                };
            }
        } else {
            app.revision = 0;
        }

        app.revision++;

        Object.freeze(app);

        this.applications.set(app.name, app);

        return {success: true};
    }

    async all(actions) {
        const results = [];

        for (const action of actions) {
            const {name, args} = action;

            if (!Object.prototype.hasOwnProperty.call(this.exposed, name) === -1) {
                results.push();
                continue;
            }

            let result = this.exposed[name](args);

            if (typeof result === 'object' &&
                typeof result.then === 'function') {
                
                result = await result;
            }

            results.push(result);
        }

        return results;
    }
    
    replaceCrashed(process) {
        const app = process.app;

        this._startProcess(app, {
            startDelay: app['restart-crashing-delay'],
            number: process.number
        });
    }
    
    startProcess(args) {
        const [appName, options] = args;
        const app = this.applications.get(appName);

        if (!app) {
            return false;
        }

        this._startProcess(app, options);
    }

    _startProcess(app, options) {
        const process = new Process(app, options);

        this.processes.set(process.id, process);
        process.move(this.generations.new);

        process.on('exit', (code, signal) => {
            this.processes.delete(process.id);
            this.log(process, `exit code=${code} signal=${signal}`);
        });

        process.on('SIGINT', () => {
            this.log(process, 'SIGINT');
        });
        
        process.on('SIGKILL', () => {
            this.log(process, 'SIGKILL');
        });
        
        process.on('move', (gen, old) => {
            this.log(process, 'moved to', old.name, 'generation');
        });

        this.log(process, 'started');

        return true;
    }
    
    stopProcess(args) {
        const [options] = args;

        const process = this.processes.get(options.id);

        if (process) {
            process.stop();
        }
    }
    
    killProcess(args) {
        const [options] = args;

        const process = this.processes.get(options.id);

        if (process) {
            process.kill();
        }
    }

    log(...args) {
        console.log(args.join(' ')); // eslint-disable-line no-console
    }
    
    err(...args) {
        console.err(args.join(' ')); // eslint-disable-line no-console
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
        
    }

    async listen(socket) {
        const parsed = url.parse(socket);
        const listen = util.promisify(this.httpServer.listen.bind(this.httpServer));

        if (parsed.protocol === 'ws+unix:') {
            const path = parsed.host + parsed.pathname;
            await listen(path);
        } else {
            await listen(Number(parsed.port), parsed.hostname);
        }
        
        this.emit('listen');
    }
        
    close() {
        this.httpServer.close();
        this.emit('close');
    }

    kill() {
        this.close();

        for (const proc of this.processes.values()) {
            proc.kill();
        }
        
        this.emit('kill');
    }
}

module.exports = Daemon;

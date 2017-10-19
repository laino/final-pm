
const child_process = require('child_process');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const rpc = require('noice-json-rpc');
const ws = require('ws');
const equal = require('deep-equal');

const mkdirp = util.promisify(require('mkdirp'));
const open = util.promisify(fs.open);

class Generation extends EventEmitter {
    constructor(handlers) {
        super();

        this.processes = new Set();
        
        for (let key of Object.keys(handlers)) {
            this.on(key, handlers[key])
        }
    }
}

function createGenerations(daemon) {
    const newGen = new Generation({
        added() {

        },
        removed() {

        }
    });
    
    const running = new Generation({
        added() {

        },
        removed() {

        }
    });
    
    const old = new Generation({
        added() {

        },
        removed() {

        }
    });
    
    const marked = new Generation({
        added() {

        },
        removed() {

        }
    });

    return {new: newGen, running, old, marked};
}

class Daemon extends EventEmitter {
    constructor() {
        super();

        this.httpServer = new http.Server();
        this.wsServer = new ws.Server({server: this.httpServer});
        this.rpcServer = new rpc.Server(this.wsServer);
        this.api = this.rpcServer.api();

        this.expose('load', 'kill', 'info');

        this.applications = new Map();
        this.generations = createGenerations(this);
    }

    expose(...args) {
        const def = {};

        args.forEach(arg => {
            def[arg] = this[arg].bind(this);
        });

        this.api.Daemon.expose(def);
    }
    
    load(applications) {
        applications.forEach((app) => {
            const old = this.applications.get(app.name);

            if (equal(old, app)) {
                return;
            }

            this.applications.set(app.name, app);
        });
    }
    
    info() {
        const processes = {};

        for (let key of Object.keys(this.generations)) {
            const proclist = Array.from(this.generations[key].processes.values());
            processes[key] = proclist.map((process) => {
                const app = process.application;
                const result = {
                    'app-name': app.name,
                    'pid': process.pid
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
        }
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
        this.emit('kill');
    }
}

Daemon.launch = async (config) => {
    const mkdirs = [
        mkdirp(config['home']),
        mkdirp(path.dirname(config['daemon-log'])),
    ];

    if (config['socket-path']) {
        mkdirs.push(mkdirp(path.dirname(config['socket-path'])));
    }

    await Promise.all(mkdirs);
    
    const logFD = await open(config['daemon-log'], 'a+');

    return new Promise((fulfill, reject) => {
        const child = child_process.spawn(path.resolve(__dirname, '../../bin/daemon'), [config.socket], {
            detached: true,    
            argv0: 'final-pm-daemon',
            stdio: [
                'ignore',
                logFD,
                logFD,
                'ipc'
            ]
        });

        child.once('exit', onExit);
        child.once('message', onMessage);

        function onExit(code, signal) {
            child.removeListener('message', onMessage);
            reject(new Error(`Daemon terminated with code ${code} and signal ${signal}. Check ${config['daemon-log']}`));
        }

        function onMessage(message) {
            if (message !== 'ready') return;
            child.removeListener('exit', onMessage);
            child.unref();
            child.channel.unref();
            fulfill(child);
        }

    });
};

module.exports = Daemon;

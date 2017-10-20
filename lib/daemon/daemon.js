const EventEmitter = require('events').EventEmitter;
const ws = require('ws');
const equal = require('deep-equal');
const http = require('http');
const url = require('url');
const util = require('util');
const rpc = require('noice-json-rpc');
const Generations = require('./generations.js');

class Daemon extends EventEmitter {
    constructor() {
        super();

        this.httpServer = new http.Server();
        this.wsServer = new ws.Server({server: this.httpServer});
        this.rpcServer = new rpc.Server(this.wsServer);
        this.api = this.rpcServer.api();

        this.expose('load', 'kill', 'info', 'wait', 'do');

        this.applications = new Map();
        this.generations = new Generations();
    }

    expose(...args) {
        const def = {};

        args.forEach(arg => {
            def[arg] = this[arg].bind(this);
        });

        this.api.Daemon.expose(def);
    }
    
    load(args) {
        const [applications, force] = args;
        const rejected = [];

        applications.forEach((app) => {
            const old = this.applications.get(app.name);

            if (equal(old, app)) {
                return;
            }

            if (old && old['config-path'] !== app['config-path'] && !force) {
                rejected.push({
                    name: app.name,
                    reason: 'path'
                });

                return;
            }

            this.applications.set(app.name, app);
        });

        return rejected;
    }

    do(args) {
        
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
        this.emit('kill');
    }
}

module.exports = Daemon;

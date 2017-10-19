
const child_process = require('child_process');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const rpc = require('noice-json-rpc');
const ws = require('ws');

const mkdirp = util.promisify(require('mkdirp'));
const open = util.promisify(fs.open);

class Daemon extends EventEmitter{
    constructor() {
        super();

        this.httpServer = new http.Server();
        this.wsServer = new ws.Server({server: this.httpServer});
        this.rpcServer = new rpc.Server(this.wsServer);
        this.api = this.rpcServer.api();

        this.expose('load', 'selection', 'kill');
    }

    expose(...args) {
        const def = {};

        args.forEach(arg => {
            def[arg] = this[arg].bind(this);
        });

        this.api.Daemon.expose(def);
    }
    
    async load(applications) {
    }

    async selection(expression) {
        return [];
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

    async kill() {
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

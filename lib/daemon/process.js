const cluster = require('cluster');
const EventEmitter = require('events').EventEmitter;

let idCounter = 0;

class Process extends EventEmitter {
    constructor(app, options = {}) {
        super();

        this.app = app;

        this.id = idCounter++;
        this.pid = -1;
        this.number = options.number || 0;

        this.child = null;
        this.ready = false;
        this.killing = false;
        this.stopping = false;
        this.terminated = false;

        this.generation = null;

        this.startTimeout = null;
        this.stopTimeout = null;
        this.startDelayTimeout = null;

        this.startTime = Date.now();

        if (options.startDelay) {
            this.startDelayTimeout = setTimeout(() => {
                this.startTimeout = null;
                this._createProcess();
            }, options.startDelay);

            this.startTime += options.startDelay;
        } else {
            this._createProcess();
        }

        Object.seal(this);
    }

    _createProcess() {
        if (this.child) return;

        this.child = createProcess(this);

        this.pid = this.child.process.pid;

        this.child.on('exit', this._onExit.bind(this));
        
        const readyOn = this.app['ready-on'];

        if (readyOn === 'message') {
            this.child.on('message', function onMessage(message) {
                if (message !== 'ready') return;

                this.child.removeListener('message', onMessage);
                
                this._onReady();
            }.bind(this));
        } else {
            this.child.once('listening', this._onReady.bind(this));
        }

        const startTimeout = this.app['start-timeout'];

        if (startTimeout === null) {
            return;
        }

        this.startTimeout = setTimeout(this._onStartTimeout.bind(this), startTimeout);
    }
    
    _onStartTimeout() {
        this.startTimeout = null;
        
        this.emit('startTimeout');
        
        if (this.generation) {
            this.generation._startTimeout(this);
        }
    }
    
    _onStopTimeout() {
        this.stopTimeout = null;
        
        this.emit('stopTimeout');

        if (this.generation) {
            this.generation._stopTimeout(this);
        }
    }
    
    _onReady() {
        if (this.stopping || this.killing) {
            return;
        }

        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }

        this.ready = true;

        this.emit('ready'); 
        
        if (this.generation) {
            this.generation._ready(this);
        }
    }

    _onExit(code, signal) {
        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }

        this.terminated = true;
        
        this.emit('exit', code, signal); 
        
        if (this.generation) {
            this.generation._exit(this, code, signal);
            this.generation = null;
        }
    }

    _clearTimeouts() {
        if (this.startDelayTimeout) {
            clearTimeout(this.startDelayTimeout);
            this.startDelayTimeout = null;
        }
        
        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.stopTimeout = null;
        }
        
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
            this.stopTimeout = null;
        }
    }

    move(generation) {
        this.emit('move', this.generation, generation);

        if (this.generation) {
            this.generation._remove(this);
        }

        this.generation = generation;

        if (this.generation) {
            this.generation._add(this);
        }
    }

    stop() {
        this.emit('stop');

        if (this.generation) {
            this.generation._stop(this);
        }
    }
    
    kill() {
        this.emit('kill');

        if (this.generation) {
            this.generation._kill(this);
        }
    }

    SIGINT() {
        if (this.terminated || this.stopping || this.killing) {
            return;
        }

        if (this.child) {
            if (!this.ready) {
                return;
            }

            if (this.app['shutdown-signal'] === 'disconnect') {
                this.child.disconnect();
            } else {
                this.child.process.kill('SIGINT');
            }

            const stopTimeout = this.app['stop-timeout'];

            if (stopTimeout !== null) {
                this.stopTimeout = setTimeout(this._onStopTimeout.bind(this), stopTimeout);
            }

        } else if (this.startDelayTimeout) {

            clearTimeout(this.startDelayTimeout);
            this.startDelayTimeout = null;
        
            setImmediate(() => {
                this._onExit(0, 'SIGINT');
            });

        } else {
            return;
        }
        
        this.stopping = true;

        this.emit('SIGINT');
    }

    SIGKILL() {
        if (this.terminated || this.killing) {
            return;
        }

        this._clearTimeouts();

        this.killing = true;
        
        if (this.child) {
            this.child.process.kill('SIGKILL');
        } else {
            setImmediate(() => {
                this._onExit(0, 'SIGKILL');
            });
        }

        this.emit('SIGKILL');
    }

    compare(other) {
        if (this.app.revision !== other.app.revision) {
            return this.app.revision - other.app.revision;
        }

        if (this.startTime !== other.startTime) {
            return this.startTime - other.startTime;
        }
        
        return this.id - other.id;
    }

    toString() {
        return `[Process=${this.app.name}/${this.number} id=${this.id} pid=${this.pid}]`;
    }
}

function createProcess(process) {
    const app = process.app;

    cluster.setupMaster({
        execArgv: app['node-args'],
        exec: app['run'],
        args: app['args'],
        cwd: app['cwd'],
    });
    
    const env = Object.assign({}, app['env']);

    if (!app['unique-instances']) {
        Object.assign(env, {
            FINAL_PM_INSTANCE_NUMBER: process.number
        });
    }

    return cluster.fork(env);
}

module.exports = Process;

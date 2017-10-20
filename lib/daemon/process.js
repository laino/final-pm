const child_process = require('child_process');
const EventEmitter = require('events').EventEmitter;

class Process extends EventEmitter {
    constructor(app, options = {}) {
        super();

        this.app = app;

        this.pid = 0;
        this.number = 0;
        this.ready = false;
        this.killing = false;
        this.stopping = false;
        this.terminated = false;

        this.generation = null;

        this.startTimeout = null;
        this.stopTimeout = null;
        this.startDelayTimeout = null;

        if (options.startDelay) {
            this.startDelayTimeout = setTimeout(() => {
                this.startTimeout = null;
                this._createProcess();
            }, options.startDelay);
        } else {
            this._createProcess();
        }
    }

    _createProcess(options) {
        if (this.child) return;

        this.child = createProcess(this.app, options);

        this.child.on('exit', this._onExit.bind(this));
        
        const readyOn = this.app['ready-on'];

        if (readyOn === 'message') {
            this.child.on('message', function onMessage(message) {
                if (message !== 'ready') return;

                this.child.removeListener('message', onMessage);
                
                this._onReady();
            });
        } else {
            this.child.once('listen', this._onReady.bind(this));
        }

        const startTimeout = this.app['start-timeout'];

        if (startTimeout === null) {
            return;
        }

        this.startTimeout = setTimeout(this._onStartTimeout, startTimeout);
    }
    
    _onStartTimeout() {
        this.startTimeout = null;
        
        this.kill();
    }
    
    _onStopTimeout() {
        this.stopTimeout = null;
        
        this.kill();
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
            this.generation._onReady(this);
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
            this.generation._onExit(this, code, signal);
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
        if (this.terminated || this.stopping || this.killing) {
            return;
        }

        if (this.child) {

            if (!this.ready) {
                return;
            }

            this.child.kill('SIGINT');

            const stopTimeout = this.app['stop-timeout'];

            if (stopTimeout !== null) {
                this.stopTimeout = setTimeout(this._onStopTimeout, stopTimeout);
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

        this.emit('stop');
    }

    kill() {
        if (this.terminated || this.killing) {
            return;
        }

        this._clearTimeouts();

        this.killing = true;
        
        if (this.child) {
            this.child.kill('SIGKILL');
        } else {
            setImmediate(() => {
                this._onExit(0, 'SIGKILL');
            });
        }

        this.emit('kill');
    }
}

function createProcess(app) {
    return child_process.fork(app['run'], app['args'], {
        cwd: app['cwd'],
        env: app['env'],
        execArgv: app['node-args']
    });
}

module.exports = Process;

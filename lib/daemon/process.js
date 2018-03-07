const cluster = require('cluster');
const child_process = require('child_process');
const path = require('path');

const {EventEmitter} = require('events');

const RUNNER = path.resolve(__dirname, 'process-runner.js');

let idCounter = 0;

class Process extends EventEmitter {
    constructor(app, options = {}) {
        super();

        this.app = app;

        this.id = options.id || idCounter++;
        this.number = options.number || 0;
        this.crashCounter = options.crashCounter || 0;
        this.startDelay = options.startDelay || 0;
        this.pid = -1;

        if (this.number === 'id') {
            this.number = this.id;
        }

        this.worker = null;
        this.process = null;

        this.started = false;
        this.ready = false;
        this.killing = false;
        this.stopping = false;
        this.terminated = false;
        this.timeout = false;
        this.cwd = options.cwd || app['cwd'];
        this.args = options.args || app['args'] || [];

        this.generation = null;

        this.startTimeout = null;
        this.stopTimeout = null;
        this.startDelayTimeout = null;

        this.startTime = 0;
        this.createTime = Date.now();
        this.loggerKey = null;

        this.buffers = {
            stdout: { bytes: 0, buffers: [], truncate: 0 },
            stderr: { bytes: 0, buffers: [], truncate: 0 },
        };

        if (app['type'] !== 'logger') {
            this.loggerKey = JSON.stringify([app['logger'], app['cwd'], app['logger-args']]);
        }

        Object.seal(this);
    }

    start() {
        if (this.started || this.terminated || this.killing) {
            return;
        }

        this.startTime = Date.now();
        this.started = true;

        if (this.startDelay) {
            this.startDelayTimeout = setTimeout(() => {
                this.startDelayTimeout = null;
                this._createProcess();
            }, this.startDelay);

            this.startTime += this.startDelay;
        } else {
            setImmediate(() => {
                this._createProcess();
            });
        }

        this.emit('start');

        if (this.generation) {
            this.generation.emit('start', this);
        }
    }

    _createProcess() {
        if (this.process) return;

        if (this.app['mode'] === 'cluster') {
            this.worker = createWorkerProcess(this);
            this.process = this.worker.process;
        } else {
            this.process = createProcess(this);
        }

        this.pid = this.process.pid;

        // 'close' instead of 'exit' so it always fires after
        // the last STDIO data events.
        this.process.on('close', this._onExit.bind(this));

        this.process.stdout.on('data', this._onSTDOUT.bind(this));
        this.process.stderr.on('data', this._onSTDERR.bind(this));

        const readyOn = this.app['ready-on'];

        if (readyOn === 'message') {
            const eventSource = this.worker || this.process;

            eventSource.on('message', function onMessage(message) {
                if (message !== 'ready') return;

                eventSource.removeListener('message', onMessage);

                this._onReady();
            }.bind(this));
        } else if (readyOn === 'listen' && this.worker) {
            this.worker.once('listening', this._onReady.bind(this));
        } else {
            setImmediate(this._onReady.bind(this));
        }

        this.process.on('error', this._onError.bind(this));

        const startTimeout = this.app['start-timeout'];

        if (startTimeout !== null) {
            this.startTimeout = setTimeout(this._onStartTimeout.bind(this), startTimeout);
        }
    }

    _onStartTimeout() {
        this.timeout = true;
        this.startTimeout = null;

        if (this.generation) {
            this.generation.emit('startTimeout', this);
        }

        this.emit('timeout', 'start');
    }

    _onStopTimeout() {
        this.timeout = true;
        this.stopTimeout = null;

        if (this.generation) {
            this.generation.emit('stopTimeout', this);
        }

        this.emit('timeout', 'stop');
    }

    _pushOutput(stream, data) {
        const streamBuffer = this.buffers[stream];
        const maxLength = this.app['max-log-line-length'];

        for (let index = 0; index >= 0 && index < data.length;) {
            const lineEnd = data.indexOf('\n', index);
            let lineData = data.slice(index, lineEnd > 0 ? lineEnd : data.length);

            index = lineEnd + 1;

            if (lineEnd > 0) {
                const line = Buffer.concat([...streamBuffer.buffers, lineData]).toString();

                this.emit('output', stream, line, streamBuffer.truncate);

                streamBuffer.buffers.length = 0;
                streamBuffer.bytes = 0;
                streamBuffer.truncate = 0;

                continue;
            }

            const total = streamBuffer.bytes + lineData.length;
            const exceeds = total - maxLength;

            if (exceeds > 0) {
                streamBuffer.truncate += exceeds;

                if (exceeds === lineData.length)
                    continue;

                lineData = lineData.slice(0, -exceeds);
            }

            streamBuffer.buffers.push(lineData);
            streamBuffer.bytes += total;
        }
    }

    _onSTDOUT(data) {
        this._pushOutput('stdout', data);
    }

    _onSTDERR(data) {
        this._pushOutput('stderr', data);
    }

    _onReady() {
        if (this.stopping || this.killing || this.timeout) {
            return;
        }

        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }

        this.ready = true;

        if (this.generation) {
            this.generation.emit('ready', this);
        }

        this.emit('ready');
    }

    _onExit(code, signal) {
        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }

        this.terminated = true;

        if (this.generation) {
            this.generation.emit('exit', this, code, signal);
            this.generation = null;
        }

        this.emit('exit', code, signal);
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

    _onError(error) {
        this.emit(error);
    }

    move(generation) {
        const old = this.generation;

        if (this.generation) {
            this.generation.emit('remove', this);
        }

        this.generation = generation;

        if (this.generation) {
            this.generation.emit('add', this);
        }

        this.emit('move', generation, old);
    }

    stop() {
        this.timeout = false;

        if (this.generation) {
            this.generation.emit('stop', this);
        }

        this.emit('stop');
    }

    kill(signal, force) {
        this.timeout = false;

        if (this.generation) {
            this.generation.emit('kill', this, signal, force);
        }

        this.emit('kill', signal, force);
    }

    send(message) {
        if (this.terminated) {
            return;
        }

        if (this.process) {
            return this.process.send(message);
        }

        return false;
    }

    sendStop() {
        if (this.terminated || this.stopping || this.killing) {
            return;
        }

        const signal = this.app['stop-signal'];

        if (this.startDelayTimeout) {
            clearTimeout(this.startDelayTimeout);
            this.startDelayTimeout = null;

            setImmediate(() => {
                this._onExit(0, signal);
            });
        } else if (this.process && this.ready) {
            if (signal === 'disconnect') {
                if (this.worker) {
                    this.worker.disconnect();
                } else {
                    this.process.disconnect();
                }
            } else {
                this.process.kill(signal);
            }

            const stopTimeout = this.app['stop-timeout'];

            if (stopTimeout !== null) {
                this.stopTimeout = setTimeout(this._onStopTimeout.bind(this), stopTimeout);
            }
        } else {
            return;
        }

        this.stopping = true;
        this.emit('signal', signal, 'stop');
    }

    sendKill(signal, force) {
        if (this.terminated || (this.killing && !force)) {
            return;
        }

        this._clearTimeouts();

        signal = signal || this.app['kill-signal'];

        const wasKilling = this.killing;
        this.killing = true;

        this.emit('signal', signal, 'kill');

        if (this.process) {
            this.process.kill(signal);
        } else if (!wasKilling) {
            this._onExit(0, signal);
        }
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
        return `Process=${this.app.name}/${this.number} id=${this.id} pid=${this.pid}`;
    }
}

function createProcessOptions(process) {
    const app = process.app;

    const args = [
        process.cwd,
        app['run']
    ].concat(process.args);

    const env = Object.assign({}, app['env']);

    if (app['unique-instances']) {
        Object.assign(env, {
            FINAL_PM_INSTANCE_NUMBER: process.number
        });
    }

    return {
        execArgv: app['node-args'],
        exec: RUNNER,
        cwd: process.cwd,
        args: args,
        env: env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    };
}

function createProcess(process) {
    const options = createProcessOptions(process);
    return child_process.fork(options.exec, options.args, options);
}

function createWorkerProcess(process) {
    const options = createProcessOptions(process);
    cluster.setupMaster(options);
    return cluster.fork(options.env);
}

module.exports = Process;

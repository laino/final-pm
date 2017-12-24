
const events = require('events');

class Logger extends events.EventEmitter {
    constructor(daemon, loggerKey) {
        super();

        const loggerData = JSON.parse(loggerKey);

        this.processes = new Set();
        this.currentProcess = null;
        this.daemon = daemon;

        this.logs = new Map();

        this.key = loggerKey;
        this.name = loggerData[0];
        this.cwd = loggerData[1];
        this.args = loggerData.slice(2);

        this.processEvents = processEvents(this);
    }

    spawnLoggingProcess() {
        const process = this.daemon.spawn(this.name, {
            cwd: this.cwd,
            args: this.args
        });

        if (!process) {
            this.daemon.err(`Couldn't spawn a new logging process of ${this.name}`);
            return;
        }

        this.processes.add(process);

        process.on('exit', () => {
            this.processes.delete(process);

            if (process == this.currentProcess) {
                this.currentProcess = null;
            }

            this._checkInactive();
        });

        process.on('move', (gen) => {
            if (gen.name === 'running') {
                this.currentProcess = process;
                this.flushAll();
                return;
            }

            if (gen.name === 'marked' || gen.name === 'old') {
                if (process == this.currentProcess) {
                    this.currentProcess = null;
                }
            }
        });
    }

    flush(logs) {
        if (!this.currentProcess) {
            if (this.processes.size === 0) {
                this.spawnLoggingProcess();
            }
            return;
        }

        for (; logs.writeIndex < logs.lines.length; logs.writeIndex++) {
            const line = logs.lines[logs.writeIndex];

            this.currentProcess.send(line.data);
        }

        this._checkRemoval(logs);
        this._checkInactive();
    }

    flushAll() {
        if (!this.currentProcess) {
            return;
        }

        for (const logs of this.logs.values()) {
            this.flush(logs);
        }
    }

    addProcess(process) {
        const logs = this._createLogsForApp(process.app);

        // Just create an entry for that process
        this._getProcessBuffer(logs, process);

        for (let [name, listener] of Object.entries(this.processEvents)) {
            process.on(name, listener);
        }
    }

    _checkRemoval(logs) {
        if (logs.processBuffers.size === 0 && logs.writeIndex === logs.lines.length) {
            this.logs.delete(logs.app.name);
        }
    }

    _checkInactive() {
        if (this.hasProcesses()) {
            return;
        }

        if (this.processes.size > 0) {
            for (const process of this.processes) {
                process.stop();
            }
            return;
        }

        this.emit('inactive');
    }

    hasProcesses() {
        return this.logs.size > (this.logs.has(this.name) ? 1 : 0);
    }

    pushData(process, stream, data) {
        const app = process.app;
        const logs = this.logs.get(app['name']);

        if (!this._guaranteeFreeSpace(logs, process, data.length)) {
            this.emit('truncate', process, data.length);
            return;
        }

        const streamBuffer = this._getStreamBuffer(logs, process, stream);

        for (let index = 0; index >= 0 && index < data.length;) {
            const lineEnd = data.indexOf('\n', index);
            const lineData = data.slice(index, lineEnd > 0 ? lineEnd : data.length);
            index = lineEnd + 1;

            if (lineEnd > 0) {
                const line = Buffer.concat([...streamBuffer.buffers, lineData]).toString();

                this._pushLogEvent(logs, process, stream, line);

                streamBuffer.buffers.length = 0;
                logs.bufferedBytes -= streamBuffer.bytes;
                streamBuffer.bytes = 0;
                continue;
            }

            streamBuffer.buffers.push(lineData);
            streamBuffer.bytes += lineData.length;
            logs.bufferedBytes += lineData.length;
        }

        this.flush(logs);
    }

    log(process, type, text, options) {
        const app = process.app;
        const logs = this.logs.get(app['name']);

        this._pushLogEvent(logs, process, type, text, options);

        if (!this.currentProcess && app['type'] === 'logger') {
            return;
        }

        this.flush(logs);
    }

    _pushLogEvent(logs, process, type, text, options = {}) {
        logs.lines.push({
            type,
            process,
            data: Object.assign({
                type,
                text,
                timestamp: Date.now(),
                app: logs.app['name'],
                processPID: process.pid,
                processID: process.id,
                processNumber: process.number,
            }, options)
        });

        logs.bytes += text.length;
    }

    _getProcessBuffer(logs, process) {
        let processBuffers = logs.processBuffers.get(process);

        if (!processBuffers)  {
            processBuffers = new Map();
            logs.processBuffers.set(process, processBuffers);
        }

        return processBuffers;
    }

    _getStreamBuffer(logs, process, stream) {
        const processBuffer = this._getProcessBuffer(logs, process);

        let streamBuffer = processBuffer.get(stream);

        if (!streamBuffer) {
            streamBuffer = {
                buffers: [],
                bytes: 0
            };
            processBuffer.set(stream, streamBuffer);
        }

        return streamBuffer;
    }

    _guaranteeFreeSpace(logs, process, amount) {
        const max = logs.app['max-buffered-log-bytes'];

        if (amount + logs.bufferedBytes > max) {
            return false;
        }

        const current = logs.bufferedBytes + logs.bytes;
        let target = current + amount;

        let i = 0;
        for (i = 0; target > max; i++) {
            const line = logs.lines[i];
            target -= line.bytes;
            logs.bytes -= line.bytes;
            logs.writeIndex--;

            if (logs.writeIndex < 0) {
                logs.writeIndex = 0;
                this.emit('truncate', line.process, line.bytes);
            }
        }

        if (i > 0) {
            logs.lines.splice(0, i);
        }

        return true;
    }

    _createLogsForApp(app) {
        let logs = this.logs.get(app['name']);

        if (logs) {
            if (app.revision > logs.app.revision) {
                logs.app = app;
            }

            return logs;
        }

        logs = {
            app,
            bytes: 0,
            writeIndex: 0,
            lines: [],
            bufferedBytes: 0,
            processBuffers: new Map()
        };

        this.logs.set(app['name'], logs);

        return logs;
    }
}

function processEvents(logger) {
    return {
        error(error) {
            logger.log(this, 'error', error.message + '\n' + error.stack, {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });
        },
        move(gen, old) {
            logger.log(this, 'moved', `moved to ${gen.name} generation`);
        },
        timeout(type) {
            logger.log(this, type + '-timeout', type + ' timeout');
        },
        signal(signal, type) {
            logger.log(this, type, `${signal} #${this.number}`);
        },
        start() {
            logger.log(this, 'start', `starting #${this.number}`);
        },
        exit(code, signal) {
            const app = this.app;
            const logs = logger.logs.get(app['name']);

            logs.processBuffers.delete(this);
            
            logger._pushLogEvent(logs, this, 'exit', `exit code=${code} signal=${signal}`);

            if (this !== logger.currentProcess) {
                logger.flush(logs);
            }
        },
        output(stream, data) {
            logger.pushData(this, stream, data);
        }
    };
}

module.exports = Logger;

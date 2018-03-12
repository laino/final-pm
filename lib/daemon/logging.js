
const events = require('events');

class Logger extends events.EventEmitter {
    constructor(daemon, loggerKey) {
        super();

        const loggerData = JSON.parse(loggerKey);

        this.loggingProcesses = new Set();
        this.logs = new Map();

        this.currentProcess = null;
        this.daemon = daemon;

        this.key = loggerKey;
        this.name = loggerData[0];
        this.cwd = loggerData[1];
        this.args = loggerData[2];
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

        this.loggingProcesses.add(process);

        process.on('exit', () => {
            this.loggingProcesses.delete(process);

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

            if (process == this.currentProcess) {
                this.currentProcess = null;
            }
        });
    }

    flush(appName) {
        const logs = this.logs.get(appName);

        if (!logs) {
            return;
        }

        if (logs.writeIndex === logs.lines.length) {
            return;
        }

        if (!this.currentProcess) {
            if(this.loggingProcesses.size === 0) {
                this.spawnLoggingProcess();
            }
            return;
        }

        for (; logs.writeIndex < logs.lines.length; logs.writeIndex++) {
            const line = logs.lines[logs.writeIndex];

            logs.writeCount++;

            this.currentProcess.send(line.data, logs.writeCB);
        }
    }

    flushAll() {
        if (!this.currentProcess) {
            return;
        }

        for (const appName of this.logs.keys()) {
            this.flush(appName);
        }
    }

    addProcess(process) {
        const logs = this._createLogsForApp(process.app);

        logs.processes.add(process);

        if (logs.removeTimeout) {
            clearTimeout(logs.removeTimeout);
            logs.removeTimeout = null;
        }
    }

    removeProcess(process) {
        const appName = process.app['name'];
        const logs = this.logs.get(appName);

        if (!logs) {
            return;
        }

        logs.processes.delete(process);

        setImmediate(() => {
            this._checkRemoveLogs(appName);
        });
    }

    _checkRemoveLogs(appName) {
        const logs = this.logs.get(appName);

        if (!logs) {
            return;
        }

        this._stopLoggerProcesses();

        if (logs.processes.size || logs.writeIndex < logs.lines.length || logs.writeCount) {
            return;
        }

        if (logs.removeTimeout) {
            return;
        }

        if (this.isAtRest()) {
            this.emit('resting');
        }

        logs.removeTimeout = setTimeout(() => {
            this.logs.delete(appName);
            this._checkInactive();
        }, logs.app['log-retention-timeout']);
    }

    _checkInactive() {
        if (this.logs.size) {
            return;
        }

        if (this.loggingProcesses.size > 0) {
            this._stopLoggerProcesses();
            return;
        }

        this.emit('inactive');
    }

    _stopLoggerProcesses() {
        if (this.loggingProcesses.size === 0) {
            return;
        }

        for (const logs of this.logs.values()){
            if (logs.processes.size || logs.writeIndex < logs.lines.length || logs.writeCount)
                return;
        }

        for (const process of this.loggingProcesses) {
            process.stop();
        }
    }

    isAtRest() {
        for (const logs of this.logs.values()){
            if (logs.processes.size === 0 && (logs.writeIndex < logs.lines.length || logs.writeCount))
                return false;
        }

        return true;
    }

    pushLine(process, stream, data, truncatedBytes) {
        this._pushLogEvent(process, stream, data.toString(), {
            truncated: truncatedBytes
        });

        if (truncatedBytes) {
            this.emit('truncate', truncatedBytes);
        }

        this.flush(process.app['name']);
    }

    log(process, type, text, options) {
        this._pushLogEvent(process, type, text, options);
        this.flush(process.app['name']);
    }

    kill() {
        for (const process of this.loggingProcesses) {
            process.kill('SIGKILL', true);
        }

        this.currentProcess = null;

        for (const logs of this.logs.values()) {
            if (logs.removeTimeout)
                clearTimeout(logs.removeTimeout);
        }

        this.logs.clear();
        this.loggingProcesses.clear();
    }

    _pushLogEvent(process, type, text, options = {}) {
        const app = process.app;
        const logs = this.logs.get(app['name']);

        if (!logs) {
            return;
        }

        const bytes = Buffer.byteLength(text);

        if (!this._guaranteeFreeSpace(logs, process, bytes)) {
            this.emit('truncate', process, bytes);
            return;
        }

        const line = {
            process,
            data: Object.assign({
                type,
                text,
                bytes,
                timestamp: Date.now(),
                app: logs.app['name'],
                process: {
                    pid: process.pid,
                    id: process.id,
                    number: process.number,
                    generation: process.generation ? process.generation.name : null
                }
            }, options)
        };

        logs.lines.push(line);
        logs.bytes += bytes;

        if (logs.removeTimeout) {
            clearTimeout(logs.removeTimeout);
            logs.removeTimeout = null;
        }

        this.emit('line', line);
    }

    _guaranteeFreeSpace(logs, process, amount) {
        const max = logs.app['max-buffered-log-bytes'];

        if (amount > max) {
            return false;
        }

        let current = logs.bytes + amount;

        if (current < max) {
            return true;
        }

        const target = max * 0.75;

        let i = 0;
        for (i = 0; current > target; i++) {
            const line = logs.lines[i];
            current -= line.data.bytes;
            logs.bytes -= line.data.bytes;
            logs.writeIndex--;

            if (logs.writeIndex < 0) {
                logs.writeIndex = 0;
                this.emit('truncate', line.process, line.data.bytes);
            }
        }

        if (i > 0) {
            logs.lines.splice(0, i);
        }

        return true;
    }

    _createLogsForApp(app) {
        const appName = app['name'];

        let logs = this.logs.get(appName);

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
            writeCount: 0,
            writeCB: createWriteCB(this, appName),
            removeTimeout: null,
            processes: new Set(),
            lines: []
        };

        this.logs.set(appName, logs);

        return logs;
    }
}

function createWriteCB(logger, appName) {
    return function() {
        let logs = logger.logs.get(appName);

        if (!logs) {
            return;
        }

        logs.writeCount--;

        if (logs.writeCount === 0) {
            logger._checkRemoveLogs(appName);
        }
    };
}

module.exports = Logger;

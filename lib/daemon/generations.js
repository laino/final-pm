
const {EventEmitter} = require('events');

function Generations(daemon) {

    /*
     * ========================
     * ==== New Generation ====
     * ========================
     */

    this.new = new Generation('new', {
        ready: (process) => {
            process.move(this.running);
        },
        exit: (process) => {
            if (!process.timeout && (process.killing || process.stopping) || !process.app['restart-new-crashing']) {
                return;
            }

            daemon.spawnCopy(process);
        },
        stop: (process) => {
            process.move(this.marked);
        },
        startTimeout: (process) => {
            process.kill();
        },
        kill: killHandler
    });

    /*
     * ============================
     * ==== Running Generation ====
     * ============================
     */

    this.running = new Generation('running', {
        added: (process) => {
            const name = process.app['name'];

            // Find running processes of same app
            let processes = [...this.running.processes()].filter((p => {
                return p.app['name'] === name;
            }));

            // Narrow further to loggers with same arguments
            if (process.app['type'] === 'logger') {
                processes = processes.filter((p) => {
                    return arrayEquals(p.args, process.args);
                });
            }

            // Find latest app revision among processes
            const app = processes.reduce((a, b) => a.app.revision > b.app.revision ? a : b).app;

            for (const proc of findSuperflousInstances(app, processes)) {
                proc.move(this.old);
            }
        },
        exit: (process) => {
            if (process.killing || process.stopping || !process.app['restart-new-crashing']) {
                return;
            }

            daemon.spawnCopy(process);
        },
        stop: (process) => {
            process.move(this.old);
        },
        kill: killHandler
    });

    /*
     * =======================
     * ==== Old Generation ===
     * =======================
     */

    this.old = new Generation('old', {
        added: (process) => {
            process.sendStop();
        },
        stopTimeout: (process) => {
            process.sendKill();
        },
        kill: killHandler,
    });

    /*
     * ==========================
     * ==== Marked Generation ===
     * ==========================
     */

    this.marked = new Generation('marked', {
        ready: (process) => {
            process.move(this.old);
        },
        startTimeout: (process) => {
            process.sendKill();
        },
        kill: killHandler,
    });

}

function killHandler(process, signal, force) {
    process.sendKill(signal, force);
}

class Generation extends EventEmitter {
    constructor(name, handlers = {}) {
        super();

        this.name = name;
        this._processes = new Map();

        for (let [name, listener] of Object.entries(handlers)) {
            this.on(name, listener);
        }

        Object.seal(this);
    }

    _ready(process) {
        this.emit('ready', process);
    }

    _add(process) {
        this._processes.set(process.id, process);

        this.emit('added', process);
    }

    _remove(process) {
        this.emit('removed', process);

        this._delete(process);
    }

    _exit(process, code, signal) {
        this._delete(process);

        this.emit('exit', process, code, signal);
    }

    _stop(process) {
        this.emit('stop', process);
    }

    _kill(process, signal, force) {
        this.emit('kill', process, signal, force);
    }

    _stopTimeout(process) {
        this.emit('stopTimeout', process);
    }

    _startTimeout(process) {
        this.emit('startTimeout', process);
    }

    _delete(process) {
        if (this._processes.get(process.id) === process) {
            this._processes.delete(process.id);
        }
    }

    processes() {
        return this._processes.values();
    }

    isEmpty() {
        return this._processes.size === 0;
    }
}

function findSuperflousInstances(app, processes) {
    const toStop = new Set();
    const uniques = new Map();

    // Look for conflicts among unique processes
    for (const proc of processes) {
        if (!proc.app['unique-instances'])
            continue;

        const current = uniques.get(proc.number);

        if (!current) {
            uniques.set(proc.number, proc);
            continue;
        }

        if (current.compare(proc) < 0) {
            uniques.set(proc.number, proc);
            toStop.add(current);
        } else {
            toStop.add(proc);
        }
    }

    // sort newest processes to the start of the array
    const remaining = processes
        .filter(_ => !toStop.has(_))
        .sort((a, b) => b.compare(a));


    // everything exceeding 'instances' should be stopped
    for (const proc of remaining.splice(app['instances'])) {
        if (proc.app['unique-instances']) {
            uniques.delete(proc.number);
        }
        toStop.add(proc);
    }

    // re-assign numbers to non-unique processes
    let i = 0;
    for (const proc of remaining) {
        if (proc.app['unique-instances']) {
            continue;
        }

        while (uniques.has(i))
            i++;

        proc.number = i;

        i++;
    }

    return toStop;
}

function arrayEquals(arr1, arr2) {
    const arr1length = arr1.length;

    if (arr1length !== arr2.length) {
        return false;
    }

    for (let i = 0; i < arr1length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }

    return true;
}

module.exports = Generations;

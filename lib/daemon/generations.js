
const equal = require('deep-equal');
const {EventEmitter} = require('events');

function Generations(daemon) {
    /*
     * ============================
     * ==== Queue Generation =====
     * ============================
     */

    this.queue = new Generation('queue', {
        add: (process) => {
            if (canStartProcess(this, process)) {
                process.start();
            }
        },
        start: (process) => {
            process.move(this.new);
        },
        kill: killHandler,
        stop: killHandler
    });

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
            startQueuedProcess(this, process);

            if (!process.app['restart-new-crashing'] || process.app['type'] === 'logger') {
                return;
            }

            // If there was no start timeout and the process was otherwise intentionally
            // stopped, don't spawn a new copy.
            if (!process.timeout && (process.killing || process.stopping)) {
                return;
            }

            daemon.spawnCopy(process);
        },
        stop: (process) => {
            if (!process.created) {
                process.sendStop();
            } else {
                process.move(this.marked);
            }
        },
        startTimeout: (process) => {
            process.sendKill();
        },
        kill: killHandler
    });

    /*
     * ============================
     * ==== Running Generation ====
     * ============================
     */

    this.running = new Generation('running', {
        add: (process) => {
            const name = process.app['name'];

            // Find running processes of same app
            let processes = [...this.running.processes()].filter((p => {
                return p.app['name'] === name;
            }));

            // Narrow further to loggers with same arguments
            if (process.app['type'] === 'logger') {
                processes = processes.filter((p) => {
                    return equal(p.args, process.args);
                });
            }

            // Find latest app revision among processes
            const app = findLatestApplication(processes);

            for (const proc of findSuperfluousInstances(app, processes)) {
                proc.move(this.old);
            }
        },
        exit: (process) => {
            startQueuedProcess(this, process);

            if (!process.app['restart-crashing'] || process.app['type'] === 'logger') {
                return;
            }

            // If the process was intentionally stopped, don't spawn a new copy.
            if (process.killing || process.stopping) {
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
        add: (process) => {
            process.sendStop();
        },
        stopTimeout: (process) => {
            process.sendKill();
        },
        exit: (process) => {
            startQueuedProcess(this, process);
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
        exit: (process) => {
            startQueuedProcess(this, process);
        },
        kill: killHandler,
    });
}

class Generation extends EventEmitter {
    constructor(name, handlers) {
        super();

        this.name = name;
        this._processes = new Map();

        this.on('add', this.addProcess);
        this.on('remove', this.removeProcess);
        this.on('exit', this.removeProcess);

        for (let [name, listener] of Object.entries(handlers)) {
            this.on(name, listener);
        }

        Object.seal(this);
    }

    addProcess(process) {
        this._processes.set(process.id, process);
    }

    removeProcess(process) {
        if (this._processes.get(process.id) === process) {
            this._processes.delete(process.id);
        }
    }

    processes() {
        return this._processes.values();
    }
}

function findSuperfluousInstances(app, processes) {
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

function startQueuedProcess(generations, oldProcess) {
    const name = oldProcess.app['name'];

    const processes = [...generations.queue.processes()]
        .filter((p) => p.app['name'] === name);

    if (processes.length === 0) {
        return;
    }

    const process = processes.reduce((a, b) => a.compare(b) > 0 ? b : a);

    if (process && canStartProcess(generations, process)) {
        process.start();
    }
}

function killHandler(process, signal, force) {
    process.sendKill(signal, force);
}


function findLatestApplication(processes) {
    return processes.reduce((a, b) => a.app.revision > b.app.revision ? a : b).app;
}

function canStartProcess(generations, process) {
    const name = process.app['name'];

    // Find running processes of same app
    let processes = [
        ...generations.new.processes(),
        ...generations.running.processes(),
        ...generations.old.processes(),
        ...generations.marked.processes()
    ].filter(p => {
        return p.app['name'] === name;
    });

    const app = findLatestApplication([...processes, process]);
    const maxInstances = app['max-instances'];

    return maxInstances === 0 || maxInstances > processes.length;
}

module.exports = Generations;


const EventEmitter = require('events').EventEmitter;

module.exports = function Generations(daemon) {

    /* 
     * ========================
     * ==== New Generation ====
     * ========================
     */

    this.new = new Generation('new', {
        ready: (process) => {
            process.move(this.running);
        },
        exit: (process, code, signal) => {
            if (code === 0 || signal || !process.app['restart-new-crashing']) {
                return;
            }

            daemon.replaceCrashed(process);
        },
        stop: (process) => {
            process.move(this.marked);
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
            const appName = process.app.name;

            // Find running processes of same app
            const processes = [...this.running.processes()].filter((p => p.app.name === appName));

            // Find latest app revision among processes
            const app = processes.reduce((a, b) => a.app.revision > b.app.revision ? a : b).app;

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

            
            for (const proc of remaining.slice(app['instances'])) {
                toStop.add(proc);
            }

            for (const proc of toStop) {
                proc.move(this.old);
            }
        },
        exit: (process, code, signal) => {
            if (code === 0 || signal || !process.app['restart-crashing']) {
                return;
            }

            daemon.replaceCrashed(process);
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
            process.SIGINT(); 
        },
        kill: killHandler
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
        kill: killHandler
    });

};

function killHandler(process) {
    process.SIGKILL();
}

class Generation extends EventEmitter {
    constructor(name, handlers = {}) {
        super();

        this.name = name;
        this._processes = new Map();
        
        for (let key of Object.keys(handlers)) {
            this.on(key, handlers[key]);
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

        this._processes.delete(process.id);
    }
    
    _exit(process, code, signal) {
        this._processes.delete(process.id);
        
        this.emit('exit', process, code, signal);
    }
    
    _stop(process) {
        this.emit('stop', process);
    }
    
    _kill(process) {
        this.emit('kill', process);
    }

    processes() {
        return this._processes.values();
    }
}


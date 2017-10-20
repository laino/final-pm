
const EventEmitter = require('events').EventEmitter;

module.exports = function Generations() {
    this.new = new Generation({
        ready: (process) => {
            process.move(this.running);
        },
        exit: (process, code, signal) => {
            // start new one
        }
    });
    
    this.running = new Generation({
        added: (process) => {
            // 1. move running processes to this.old
            // 2. re-assign process numbers to non-unique processes
        },
        exit: (process, code, signal) => {
            // start new one
        }
    });
    
    this.old = new Generation({
        added: (process) => {
            process.stop(); 
        }
    });
    
    this.marked = new Generation({
        ready: (process) => {
            process.move(this.old)
        }
    });
}

class Generation extends EventEmitter {
    constructor(handlers = {}) {
        super();

        this.processes = new Set();
        
        for (let key of Object.keys(handlers)) {
            this.on(key, handlers[key]);
        }
    }

    _add(process) {
        this.processes.add(process);
        
        this.emit('added', process);
    }

    _remove(process) {
        this.processes.remove(process);

        this.emit('removed', process);
    }
    
    _exit(process, code, signal) {
        this.processes.remove(process);
        
        this.emit('exit', process, code, signal);
    }
}


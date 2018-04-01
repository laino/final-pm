
/* eslint-disable no-console */

const finalPM = require('../');
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const os = require('os');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const util = require('util');
const deepEqual = require('deep-equal');
const rmdir = util.promisify(require('rmdir'));

chai.use(chaiAsPromised);

const runningProcesses = new Set();
const runningDaemons = new Set();
const clients = new Set();
const tmpfiles  = new Set();
const appdirs  = new Set();
const daemonOut = new WeakMap();
const daemonSocks = new WeakMap();

process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection:", reason);
    throw reason;
});

let portCounter = 30511;

exports.daemon = async () => {
    const daemon = new finalPM.daemon();

    let socket = exports.tmpsocket(exports.tmpdir());

    const output = [];

    runningDaemons.add(daemon);
    daemonOut.set(daemon, output);
    daemonSocks.set(daemon, socket);

    daemon.on('kill', () => {
        runningDaemons.delete(daemon);
    });

    daemon.on('logger-output', (...args) => {
        output.push(['Logger', ...args]);
    });

    await daemon.loadBuiltins();
    await daemon.listen(socket);

    return daemon;
};

exports.isWindows = () => {
    return os.platform() === 'win32';
};

exports.client = async(daemon) => {
    const client = await finalPM.client.connect(daemonSocks.get(daemon));

    clients.add(client);

    client.on('close', () => {
        clients.delete(client);
    });

    return new WrapClient(client);
};

class WrapClient {
    constructor(client) {
        this.client = client;
    }

    async invoke(...args) {
        const result = await this.client.invoke.apply(this.client, args);

        if (!typeof result === 'object' && typeof result.success !== 'boolean') {
            throw new Error("Result didn't conform to { success: Boolean } schema!");
        }

        return result;
    }

    async close() {
        await this.client.close();
    }
}

exports.deepEqual = deepEqual;

exports.objectMatches = (toTest, obj) => {
    for (const [key, value] of Object.entries(obj)) {
        if (!Object.prototype.hasOwnProperty.call(toTest, key))
            return false;

        if (!exports.deepEqual(toTest[key], value))
            return false;
    }

    return true;
};

exports.matchingObjects = (array, obj) => {
    return array.filter((test) => {
        return exports.objectMatches(test, obj);
    });
};


exports.daemonWithConfig = async (name = 'working.js') => {
    const daemon = await exports.daemon();
    const samples = await exports.loadConfig(name);

    samples.forEach((sample) => {
        daemon.add(sample);
    });

    return daemon;
};

exports.loadConfig = async (name = 'working.js') => {
    const config = await finalPM.config.getConfig(
        path.resolve(__dirname, 'configs', name));

    config.applications.forEach((app) => {
        // Change each applications CWD to a custom tmp dir.
        // With file-logger their log file will be in this
        // directory.
        app['cwd'] = exports.appdir();
    });

    return config.applications;
};

exports.trackProcess = (child) => {
    if (!child) {
        return null;
    }

    if (child.then) {
        return child.then((child) => {
            return exports.trackProcess(child);
        });
    }

    runningProcesses.add(child);

    child.on('exit', () => {
        runningProcesses.delete(child);
    });

    return child;
};

exports.wait = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

exports.awaitEvent = (emitter, event) => {
    return new Promise((resolve) => {
        emitter.on(event, resolve);
    });
};

exports.tmpsocket = (home) => {
    if (exports.isWindows()) {
        return 'ws://localhost:' + (portCounter++);
    } else {
        return 'ws+unix://' + path.join(home, 'daemon.sock');
    }
};

exports.tmplaunchconfig = async () => {
    const home = exports.tmpdir();

    const config = await finalPM.config.getConfig({
        path: null,
        env: {
            FINAL_PM_CONFIG_HOME: home,
            FINAL_PM_CONFIG_SOCKET: exports.tmpsocket(home),
        }
    });

    return config;
};

exports.appdir = () => {
    const dir = exports.tmpdir();
    appdirs.add(dir);
    return dir;
};

exports.tmpdir = () => {
    const dir = exports.tmp();
    fs.mkdirSync(dir);
    return dir;
};

exports.tmp = () => {
    const file = tmp.tmpNameSync();
    tmpfiles.add(file);
    return file;
};

exports.exists = util.promisify(fs.exists);
exports.readFile = util.promisify(fs.readFile);

afterEach(async function() { //eslint-disable-line no-undef
    let hadDaemon = false;
    let daemonStopped = false;
    let hadClient = false;
    let hadProcesses = false;
    let failed = !this.currentTest || this.currentTest.state === 'failed';
    let processes = [];
    let output = [];

    if (runningProcesses.size) {
        for (const child of runningProcesses) {
            child.kill('SIGKILL');
        }

        hadProcesses = true;
    }

    if (clients.size) {
        for (const client of clients) {
            await client.close();
        }

        hadClient = true;
    }

    if (runningDaemons.size) {
        for (const daemon of runningDaemons.values()) {
            processes = processes.concat(daemon.info().processes);
            output = output.concat(daemonOut.get(daemon));
            await Promise.race([
                exports.wait(1000),
                daemon.killDaemon().then(() => daemonStopped = true)
            ]);
        }

        hadDaemon = true;
    }

    if (failed) {
        for (const dir of appdirs.values()) {
            const logfile = path.resolve(dir, 'log.txt');

            if (await exports.exists(logfile)) {
                console.log(`--- Application log file (${logfile}) ---`);
                const contents = (await exports.readFile(logfile)).toString();
                console.log((contents.trim().length ? contents : '***empty***') + '\n');
            }
        }

        if (output.length) {
            console.log("--- Daemon output ---");

            output.forEach((args) => console.log(args.join(' | ')));

            console.log();
        }

        if (processes.length) {
            console.log("--- Remaining processes ---");

            processes.forEach((proc) => {
                console.log(`${proc['app-name']}/${proc.number} ${proc.generation} ` +
                    `crashes=${proc.crashes} id=${proc.id} pid=${proc.pid}`);
            });
        }
    }

    for (const dir of tmpfiles.values()) {
        if (dir.length < 3) // sanity check...
            continue;

        try {
            await rmdir(dir);
        } catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }

    appdirs.clear();
    tmpfiles.clear();

    if (hadDaemon && !failed) {
        if (!daemonStopped) {
            throw new Error("A daemon was still running after the test and didn't stop when asked.");
        }
        throw new Error("A daemon was still running after the test.");
    }

    if (hadClient && !failed) {
        throw new Error("A client was still connected after the test.");
    }

    if (hadProcesses && !failed) {
        throw new Error("Test left behind rogue processes.");
    }
});

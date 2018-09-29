
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
const {EventEmitter} = require('events');

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

    let socket = exports.tmpSocket(exports.tmpdir());

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

class WrapClient extends EventEmitter {
    constructor(client) {
        super();

        this.client = client;

        this.client.on('publish', (type, data) => {
            this.emit('publish', type, data);
        });
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


exports.daemonWithConfig = async (name = 'working.json') => {
    const daemon = await exports.daemon();
    const samples = await exports.loadConfig(name);

    samples.forEach((sample) => {
        daemon.add(sample);
    });

    return daemon;
};

exports.daemonWithGolem = async (config, fn) => {
    const daemon = await exports.daemon();
    const golem = exports.createGolem(config, fn);

    daemon.add(golem);

    return daemon;
};

exports.loadConfig = async (name = 'working.json') => {
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

exports.createGolem = async (config, fn) => {
    const baseConfig = await exports.loadConfig('golem.json')[0];
    const code = '(' + fn.toString() + ')()';

    Object.assign(baseConfig, {env: { INJECT: code } }, config);

    console.log(baseConfig);

    return baseConfig;
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

exports.awaitLogLine = (client, app, maxMs, test) => new Promise(async (resolve, reject) => {
    let ended = false;
    let gotResponse = false;
    let lastTimestamp = 0;

    const timeout = setTimeout(async () => {
        onEnd(new Error("timeout waiting for log line"));
    }, maxMs);

    client.on('publish', onPublish);

    const response = await client.invoke('logs', app, { follow: true } );

    gotResponse = true;

    if (ended) {
        return;
    }

    for (const line of response.lines) {
        testLine(line);

        if (ended) {
            return;
        }
    }

    function onPublish(type, data) {
        if (ended) {
            return;
        }

        if (!gotResponse) {
            onEnd(new Error("Got log lines before log response."));
            return;
        }

        if (type !== 'log-' + app) {
            return;
        }

        testLine(data);
    }

    function testLine(line) {
        if (line.timestamp < lastTimestamp) {
            onEnd(new Error("Receiving lines out of order."));
            return;
        }

        lastTimestamp = line.timestamp;

        if (typeof test === 'function') {
            let result;

            try {
                result = test(line);
            } catch (error) {
                onEnd(error);
                return;
            }

            if (result) {
                onEnd(null, line);
            }

            return;
        }

        if (typeof test === 'string' && test === line.type) {
            onEnd(null, line);
        }
    }

    function onEnd(error, result) {
        if (ended) {
            console.error(new Error("already ended"));
            return;
        }

        ended = true;

        client.removeListener('publish', onPublish);
        clearTimeout(timeout);

        client.invoke('unfollow', app).then(() => {
            if (error) {
                return reject(error);
            }

            resolve(result);
        }, reject);
    }
});

exports.awaitEvent = (emitter, event) => {
    return new Promise((resolve) => {
        emitter.on(event, resolve);
    });
};

exports.tmpSocket = (home, usePort) => {
    if (usePort || exports.isWindows()) {
        return 'ws://localhost:' + (portCounter++);
    } else {
        return 'ws+unix://' + path.join(home, 'daemon.sock');
    }
};

exports.tmpLaunchConfig = async (usePort) => {
    const home = exports.tmpdir();

    const config = await finalPM.config.getConfig({
        path: null,
        env: {
            FINAL_PM_CONFIG_HOME: home,
            FINAL_PM_CONFIG_SOCKET: exports.tmpSocket(home, usePort),
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
            client.close();
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

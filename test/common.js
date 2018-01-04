
/* eslint-disable no-console */

const finalPM = require('../');
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const util = require('util');
const deepEqual = require('deep-equal');
const rmdir = util.promisify(require('rmdir'));
const {Client} = require('final-rpc');

chai.use(chaiAsPromised);

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

exports.daemon = async () => {
    const daemon = new finalPM.daemon();
    const socket = 'ws+unix://' + path.join(exports.tmpdir(), 'daemon.sock');
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

exports.client = async(daemon) => {
    const client = await new Client(daemonSocks.get(daemon)).waitOpen();

    clients.add(client);

    client.on('close', () => {
        clients.delete(client);
    });

    return client;
};

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
    let hadClient = false;
    let failed = !this.currentTest || this.currentTest.state === 'failed';
    let processes = [];
    let output = [];

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
            await daemon.killDaemon();
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
        throw new Error("A daemon was still running after the test.");
    }

    if (hadClient && !failed) {
        throw new Error("A client was still connected after the test.");
    }
});

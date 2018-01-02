
const finalPM = require('../');
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const util = require('util');
const rmdir = util.promisify(require('rmdir'));

let exitCode = 0;
let runningDaemons = new Set();
let tmpfiles  = new Set();

process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection:", reason); // eslint-disable-line no-console
    exitCode = 1;
    throw reason;
});

process.prependListener("exit", (code) => {
    if (code === 0) {
        process.exit(exitCode);
    }
});

exports.daemon = async () => {
    const daemon = new finalPM.daemon();

    runningDaemons.add(daemon);

    await daemon.loadBuiltins();

    daemon.on('kill', () => {
        runningDaemons.delete(daemon);
    });

    return daemon;
};

exports.samples = async () => {
    const config = await finalPM.config.getConfig(
        path.resolve(__dirname, '..', 'examples', 'process-config.js'));

    config.applications.forEach((app) => {
        app['logger'] = 'file-logger';
        app['cwd'] = exports.tmpdir();
    });

    return config.applications;
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

afterEach(async function() { // eslint-disable-line no-undef
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

    tmpfiles.clear();

    if (runningDaemons.size) {
        for (const daemon of runningDaemons.values()) {
            await daemon.killDaemon();
        }

        throw new Error("A daemon was still running after the test");
    }
});

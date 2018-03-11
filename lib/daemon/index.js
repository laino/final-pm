
const fs = require('fs');
const util = require('util');
const path = require('path');
const lockfile = require('lockfile');
const child_process = require('child_process');
const finalPM = require('../../');

const mkdirp = util.promisify(require('mkdirp'));
const open = util.promisify(fs.open);
const unlink = util.promisify(fs.unlink);

module.exports = exports = require('./daemon.js');

const lockfileLock = util.promisify(lockfile.lock.bind(lockfile));
const lockfileUnlock = util.promisify(lockfile.unlock.bind(lockfile));

function launchInternal(config, logFD, fulfill, reject) {
    const daemon = path.resolve(__dirname, '..', '..', 'bin', 'daemon');
    const {socket} = config;

    // Start the daemon process, redirecting it's stderr and stdout to logFD.
    const child = child_process.spawn(process.argv[0], [daemon, socket], {
        detached: true,
        windowsHide: true,
        stdio: ['ignore', logFD, logFD, 'ipc']
    });

    child.once('error', err => {
        child.removeAllListeners();
        reject(err);
    });

    child.once('exit', (code, signal) => {
        child.removeAllListeners();
        reject(new Error(
            `Daemon terminated with code ${code} and signal ${signal}. ` +
            `Check ${config['daemon-log']}`));
    });

    child.once('message', message =>{
        if (message !== 'ready') {
            // Not what we expected!
            return;
        }

        try {
            child.removeAllListeners();
            child.channel.unref();
            child.unref();
            fulfill(child);
        }
        catch (ex) {
            reject(ex);
        }
    });
}

exports.launch = async function(config) {
    const mkdirs = [
        mkdirp(config['home']),
        mkdirp(path.dirname(config['daemon-log'])),
    ];

    const socketPath = config['socket-path'];

    if (socketPath) {
        mkdirs.push(mkdirp(path.dirname(config['socket-path'])));
    }

    await Promise.all(mkdirs);

    if (socketPath) {
        await lockfileLock(socketPath + '.launch-lock');
        await cleanupSocket();
    }

    const logFD = await open(config['daemon-log'], 'a');

    try {
        await new Promise(launchInternal.bind(null, config, logFD));
    } finally {
        await unlock();
    }

    async function cleanupSocket() {
        try {
            const client = await finalPM.client.connect(config.socket);
            await client.close();
            await unlock();

            throw new Error("Daemon already running.");
        } catch (error) {
            if (!(error instanceof finalPM.client.ConnectionError)) {
                throw error;
            }

            if (error.code === 'ECONNREFUSED') {
                await unlink(socketPath);
            }
        }
    }

    async function unlock() {
        if (socketPath) {
            await lockfileUnlock(socketPath + '.launch-lock');
        }
    }
};

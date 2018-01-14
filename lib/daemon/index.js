
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

    return new Promise((fulfill, reject) => {
        const child = child_process.spawn(path.resolve(__dirname, '../../bin/daemon'), [config.socket], {
            detached: true,
            argv0: 'final-pm-daemon',
            stdio: [
                'ignore',
                logFD,
                logFD,
                'ipc'
            ]
        });

        child.once('exit', onExit);
        child.once('message', onMessage);

        function onExit(code, signal) {
            child.removeListener('message', onMessage);
            reject(new Error(`Daemon terminated with code ${code} and signal ${signal}. ` +
                             `Check ${config['daemon-log']}`));
        }

        function onMessage(message) {
            if (message !== 'ready') return;
            child.removeListener('exit', onMessage);
            child.unref();
            child.channel.unref();
            fulfill(child);
        }
    }).finally(unlock);

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

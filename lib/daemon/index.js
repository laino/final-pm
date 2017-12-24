
const fs = require('fs');
const util = require('util');
const path = require('path');
const child_process = require('child_process');

const mkdirp = util.promisify(require('mkdirp'));
const open = util.promisify(fs.open);

module.exports = exports = require('./daemon.js');

exports.launch = async function(config) {
    const mkdirs = [
        mkdirp(config['home']),
        mkdirp(path.dirname(config['daemon-log'])),
    ];

    if (config['socket-path']) {
        mkdirs.push(mkdirp(path.dirname(config['socket-path'])));
    }

    await Promise.all(mkdirs);

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

    });
};

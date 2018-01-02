
const finalPM = require('../');
const tmp = require('tmp');

let unhandledRejectionExitCode = 0;

process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection:", reason); // eslint-disable-line no-console
    unhandledRejectionExitCode = 1;
    throw reason;
});

process.prependListener("exit", (code) => {
    if (code === 0) {
        process.exit(unhandledRejectionExitCode);
    }
});

exports.daemon = async () => {
    const daemon = new finalPM.daemon();
    await daemon.loadBuiltins();
    return daemon;
};

exports.tmp = () => {
    return tmp.tmpNameSync();
};

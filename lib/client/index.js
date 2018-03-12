const {Client} = require('final-rpc');

const FAIL_CODES = new Set(['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTSOCK']);

class ConnectionError extends Error {
    constructor(msg, code) {
        super(msg);

        this.name = 'ConnectionError';
        this.code = code;
    }
}

exports.ConnectionError = ConnectionError;

exports.connect = async function(url) {
    try {
        return await new Client(url).waitOpen();
    } catch (error) {
        if (FAIL_CODES.has(error.code)) {
            throw new ConnectionError(error.message, error.code);
        } else {
            throw error;
        }
    }
};

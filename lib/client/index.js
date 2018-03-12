const {Client} = require('final-rpc');

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
        if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ||
            error.code === 'ECONNRESET' || 'ENOTSOCK') {

            throw new ConnectionError(error.message, error.code);
        } else {
            throw error;
        }
    }
};

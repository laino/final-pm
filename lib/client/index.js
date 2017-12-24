const {Client} = require('final-rpc');

class ConnectionError extends Error {
    constructor(msg) {
        super(msg);

        this.name = 'ConnectionError';
    }
}

exports.connect = async function(url) {
    try {
        return await new Client(url).waitOpen();
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ||
            error.code === 'ECONNRESET') {

            throw new ConnectionError(error.message);
        } else {
            throw error;
        }
    }
};

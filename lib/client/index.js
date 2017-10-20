
const rpc = require('noice-json-rpc');
const WebSocket = require('ws');

class ConnectionError extends Error {
    constructor(msg) {
        super(msg);

        this.name = 'ConnectionError';
    }
}

exports.connect = (url) => {
    return new Promise((fulfill, reject) => {
        const socket = new WebSocket(url);
        const rpcClient = new rpc.Client(socket);

        socket.once('open', onOpen);
        socket.once('error', onError);
        rpcClient.once('error', onError);

        function onOpen() {
            removeListeners();

            fulfill(rpcClient);
        }

        function onError(error) {
            removeListeners();

            if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED' ||
                 error.code === 'ECONNRESET') {
                reject(new ConnectionError(error.message));
            } else {
                reject(error);
            }
        }

        function removeListeners() {
            socket.removeListener('open', onOpen);
            socket.removeListener('error', onError);
            rpcClient.removeListener('error', onError);
        }
    });
}

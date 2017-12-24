
function errorHandler(error) {
    process.send({error: error.message});
    process.exit(1);
}

function resultHandler(result) {
    process.send({result});
}

process.on('uncaughtException', errorHandler);
process.on('unhandledRejection', errorHandler);

const result = require(process.argv[2]);

if (typeof result.next === 'function') {
    result.next(resultHandler);
} else {
    resultHandler(result);
}

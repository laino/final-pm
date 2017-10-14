module.exports = {
    'args': [],
    'node-args': [],
    'ready-on': 'listen',
    'instances': 1,
    'cwd': './',
    'unique-instances': true,
    'restart-crashing': true,
    'restart-new-crashing': true,
    'restart-crashing-timeout': 1000,
    'logger': 'file-logger',
    'logger-args:': ['log.txt'],
    'max-buffered-log-lines': 1000,
    'stop-timeout': null,
    'start-timeout': null
};

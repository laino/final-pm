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
    'stop-timeout': 0
};

// sample-config.js
module.exports = {
    'applications': [{
        'name': 'app',
        'ready-on': 'message',
        'stop-signal': 'SIGTERM',
        'run': './../apps/stdout.js'
    }, {
        'name': 'trim',
        'ready-on': 'message',
        'run': './../apps/stdout.js',
        'stop-signal': 'SIGTERM',
        'max-log-line-length': 5,
    }, {
        'name': 'expire',
        'ready-on': 'message',
        'run': './../apps/stdout.js',
        'stop-signal': 'SIGTERM',
        'log-retention-timeout': 200,
    }, {
        'name': 'spammy',
        'ready-on': 'message',
        'stop-signal': 'message',
        'run': './../apps/spammy-app.js',
        'max-buffered-log-bytes': 20,
    }]
};

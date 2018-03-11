// sample-config.js
module.exports = {
    'applications': [{
        'name': 'spammy',
        'ready-on': 'message',
        'stop-signal': 'message',
        'run': './../apps/spammy-app.js',
        'max-buffered-log-bytes': 20,
    }]
};

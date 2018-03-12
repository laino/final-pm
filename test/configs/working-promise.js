// sample-config.js
module.exports = new Promise((resolve) => {
    resolve({
        'applications': [{
            'name': 'app',
            'ready-on': 'message',
            'stop-signal': 'message',
            'run': './../apps/sample-app.js',
            'start-timeout': 2000,
            'stop-timeout': 2000,
            'instances': 3,
        }, {
            'name': 'app-uniform',
            'ready-on': 'message',
            'stop-signal': 'message',
            'run': './../apps/sample-app.js',
            'instances': 3,
            'unique-instances': false
        }, {
            'name': 'app-listen',
            'args': ['listen'],
            'ready-on': 'listen',
            'stop-signal': 'message',
            'run': './../apps/sample-app.js',
        }, {
            'name': 'app-message',
            'ready-on': 'message',
            'stop-signal': 'message',
            'run': './../apps/sample-app.js',
        }, {
            'name': 'app-instant',
            'ready-on': 'instant',
            'stop-signal': 'message',
            'run': './../apps/sample-app.js',
        }, {
            'name': 'crashingApp',
            'ready-on': 'message',
            'run': './../apps/crashing-app.js',
        }, {
            'name': 'neverStarts',
            'ready-on': 'message',
            'start-timeout': 3000,
            'max-instances': 2,
            'run': './../apps/never-starting-app.js',
        }, {
            'name': 'neverStops',
            'ready-on': 'message',
            'stop-timeout': 3000,
            'run': './../apps/never-stopping-app.js',
        }, {
            'name': 'neverStartsFast',
            'ready-on': 'message',
            'start-timeout': 100,
            'run': './../apps/never-starting-app.js',
        }, {
            'name': 'neverStopsFast',
            'ready-on': 'message',
            'stop-timeout': 100,
            'run': './../apps/never-stopping-app.js',
        }, {
            'name': 'zombie',
            'ready-on': 'message',
            'run': './../apps/zombie.js',
            'kill-signal': 'SIGTERM',
            'start-timeout': 500 // immediately become a zombie
        }]
    });
});

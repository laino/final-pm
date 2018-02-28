// sample-config.js
module.exports = new Promise((resolve) => {
    resolve({
        'applications': [{
            'name': 'app',
            'ready-on': 'message',
            'run': '../../examples/sample-app.js',
        }, {
            'name': 'app-listen',
            'ready-on': 'listen',
            'run': '../../examples/sample-app.js',
        }, {
            'name': 'app-instant',
            'ready-on': 'instant',
            'run': '../../examples/sample-app.js',
        }, {
            'name': 'crashingApp',
            'ready-on': 'message',
            'run': '../../examples/crashing-app.js',
        }, {
            'name': 'neverStarts',
            'ready-on': 'message',
            'start-timeout': 3000,
            'run': './../apps/never-starting-app.js',
        }, {
            'name': 'neverStops',
            'ready-on': 'message',
            'stop-timeout': 3000,
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

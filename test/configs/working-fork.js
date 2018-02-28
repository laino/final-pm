// sample-config.js
module.exports = {
    'applications': [{
        'name': 'app',
        'mode': 'fork',
        'ready-on': 'message',
        'run': '../../examples/sample-app.js',
    }, {
        'name': 'app-listen',
        'mode': 'fork',
        'ready-on': 'instant', // Can't use 'listen' in fork mode
        'run': '../../examples/sample-app.js',
    }, {
        'name': 'app-instant',
        'mode': 'fork',
        'ready-on': 'instant',
        'run': '../../examples/sample-app.js',
    }, {
        'name': 'crashingApp',
        'mode': 'fork',
        'ready-on': 'message',
        'run': '../../examples/crashing-app.js',
    }, {
        'name': 'neverStarts',
        'ready-on': 'message',
        'mode': 'fork',
        'start-timeout': 3000,
        'run': './../apps/never-starting-app.js',
    }, {
        'name': 'neverStops',
        'mode': 'fork',
        'ready-on': 'message',
        'stop-timeout': 3000,
        'run': './../apps/never-stopping-app.js',
    }, {
        'name': 'zombie',
        'mode': 'fork',
        'ready-on': 'message',
        'run': './../apps/zombie.js',
        'kill-signal': 'SIGTERM',
        'start-timeout': 500 // immediately become a zombie
    }]
};

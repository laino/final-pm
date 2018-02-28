// sample-config.js
module.exports = {
    'applications': [{
        'name': 'app',
        'mode': 'fork',
        'ready-on': 'message',
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
        'run': './../../examples/never-starting-app.js',
    }, {
        'name': 'neverStops',
        'mode': 'fork',
        'ready-on': 'message',
        'stop-timeout': 3000,
        'run': './../../examples/never-stopping-app.js',
    }, {
        'name': 'zombie',
        'mode': 'fork',
        'ready-on': 'message',
        'run': './../../examples/zombie.js',
        'kill-signal': 'SIGTERM',
        'start-timeout': 500 // immediately become a zombie
    }]
};

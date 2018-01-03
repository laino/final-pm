// sample-config.js
module.exports = function() {
    return {
        'applications': [{
            'name': 'app',
            'ready-on': 'message',
            'run': '../../examples/sample-app.js',
        }, {
            'name': 'crashingApp',
            'ready-on': 'message',
            'run': '../../examples/crashing-app.js',
        }, {
            'name': 'neverStarts',
            'ready-on': 'message',
            'start-timeout': 3000,
            'run': './../../examples/never-starting-app.js',
        }, {
            'name': 'neverStops',
            'ready-on': 'message',
            'stop-timeout': 3000,
            'run': './../../examples/never-stopping-app.js',
        }, {
            'name': 'zombie',
            'ready-on': 'message',
            'run': './../../examples/zombie.js',
            'kill-signal': 'SIGTERM',
            'start-timeout': 500 // immediately become a zombie
        }]
    };
};

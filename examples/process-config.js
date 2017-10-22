// sample-config.js 
module.exports = {
    'applications': [{
        'name': 'app',                      
        'ready-on': 'message',
        'run': './sample-app.js', 
    }, {
        'name': 'crashingApp',                      
        'ready-on': 'message',
        'run': './crashing-app.js', 
    }, {
        'name': 'neverStarts',                      
        'ready-on': 'message',
        'start-timeout': 3000,
        'run': './never-starting-app.js', 
    }, {
        'name': 'neverStops',                      
        'ready-on': 'message',
        'stop-timeout': 3000,
        'run': './never-stopping-app.js', 
    }]
};

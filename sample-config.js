// sample-config.js 
module.exports = {
    'applications': [
        'name': 'myApp',                      
        'run': './sample-app.js', 
        'args': ['arg1', 'arg2'],
        'node-args': ['--harmony'],
        'ready-on': 'message',
        'instances': process.env['NPM_PACKAGE_CONFIG_WORKERS'] || 4,
    ]
};

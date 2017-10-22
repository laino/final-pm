// sample-config.js 
module.exports = {
    'applications': [{
        'name': 'myApp',                      
        'run': './sample-app.js', 
        'args': ['arg1', 'arg2'],
        'node-args': ['--harmony'],
        'ready-on': 'message',
        'unique-instances': false,
        'instances': process.env['npm_package_config_workers'] || 4,
    }]
};

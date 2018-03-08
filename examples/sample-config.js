// sample-config.js
module.exports = {
    'applications': [{
        'name': 'app',
        'run': './sample-app.js',
        'args': ['arg1', 'arg2'],
        'node-args': ['--harmony'],
        'ready-on': 'message',
        'instances': process.env['npm_package_config_workers'] || 4,
    }]
};

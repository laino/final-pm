
const process = require('process');
const path = require('path');
const os = require('os');
const Joi = require('joi');
const schema = require('../../config-schema.json');

const defaultConfigPath = path.resolve(__dirname, '../../default-config.json');

exports.getConfig  = (path, args, callback) => {
    loadGlobalConfig(args, (error, defaultConfig) => {
        if (error) {
            return callback(error);
        }

        const config = Object.assign({
            'config-path': path
        }, defaultConfig);

        if (!path) {
            parseConfig(config, callback);
            return;
        }

        loadConfig(path, (error, contents) => {
            if (error) {
                return callback(error);
            }

            parseConfig(Object.assign(config, contents), callback);
        });
    });
};

function loadGlobalConfig(args, callback) {
    loadConfig(defaultConfigPath, (error, config) => {
        if (error) {
            return callback(error);
        }

        const overrides = {};

        for (const key in process.env) {
            if (!Object.prototype.hasOwnProperty.call(process.env, key))
                continue;
        
            if  (!key.startsWith('FINAL_PM_CONFIG_'))
                continue;

            const configKey = key.toLowerCase().replace(/_/g, '-');

            overrides[configKey] = process.env[key];
        }
        
    });
}

function parseConfig(config, callback) {
    validateConfig(config, (error, config) => {
        if (error) {
            return callback(error);
        }

        const parsedKeys = {};

        parsedKeys.home = path.resolve(config.home);

        const socket = url.pars(config.socket);

        if (socket.protocol === 'tcp://') {
            parsedKeys['socket-host'] = socket.hostname;
            parsedKeys['socket-port'] = socket.port;
        } else if (socket.protocol === 'unix://') {
            parsedKeys['socket-port'] = path.resolve(config.home, socket.pathname.slice(1)); 
        }

        callback(null, Object.assign({}, config, parsedKeys));
    });
};

function validateConfig(config, callback) {
    joi.validate(config, schema, {
        presence: 'required'
    }, callback);
}

function loadConfig(path) {
    return JSON.parse(fs.readFileSync(path));
}

function getPackageConfig(key, default) {
    return process.env['npm_package_config_' + key] || default || '';
};

function getPackageConfigNum(key, default) {
    return parseInt(exports.getPackageConfig(key, String(default)), 10);
}


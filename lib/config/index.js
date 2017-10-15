
const process = require('process');
const os = require('os');
const util = require('util');
const url = require('url');
const fs = require('fs');
const Joi = require('joi');
const path = require('path');
const schema = require('./config-schema.js');
const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);

const defaultConfigPath = path.resolve(__dirname, '../../config/default-config.js');

class ConfigError extends Error {
    constructor(message) {
        super(message);
    }
}

exports.getConfig  = async (options) => {
    if (typeof options === 'string') {
        options = { path: options };
    }

    const args = options.args || [];
    const configPath = options.path;

    const config = Object.assign({
        'config-path': configPath
    }, await loadGlobalConfig(args));

    if (configPath) {
        Object.assign(config, await loadConfig(configPath));
    }
    
    return parseConfig(config);
};

exports.resolveConfig = async (configPath) => {
    const resolved = path.resolve(configPath);
    
    let checkParent = !configPath.startsWith('./') &&
                      !configPath.startsWith('/') &&
                      resolved !== '/' &&
                      resolved !== os.homedir();
     
    try {
        const fileInfo = await stat(resolved);

        if (!fileInfo.isDirectory()) {
            return Promise.resolve(resolved);
        }

        const paths = (await Promise.all([
            exports.resolveConfig(path.join(resolved, './process-config.js')),
            exports.resolveConfig(path.join(resolved, './process-config.json'))
        ])).filter(_ => _);

        if (paths.length === 0 && checkParent) {
            return exports.resolveConfig(path.join(configPath, '../'));
        }

        return paths[0];
    } catch (error) {
        if (error.code === 'ENOENT') {
            return;
        }

        throw error;
    }
};

async function loadGlobalConfig(args) {
    const config = await loadConfig(defaultConfigPath);

    for (const key in process.env) {
        if (!Object.prototype.hasOwnProperty.call(process.env, key))
            continue;
    
        if  (!key.startsWith('FINAL_PM_CONFIG_'))
            continue;

        const configKey = key.toLowerCase().replace(/_/g, '-');

        config[configKey] = process.env[key];
    }

    return config;
}

async function parseConfig(config) {
    config = await validateConfig(config);

    config.home = path.resolve(config.home);

    const socket = url.parse(config.socket);

    if (socket.protocol === 'tcp:' || socket.protocol === 'http:') {
        config['socket-host'] = socket.hostname;
        config['socket-port'] = socket.port;
    } else if (socket.protocol === 'unix:') {
        const fullPath = socket.host + socket.pathname;
        config['socket-path'] = path.resolve(config.home, fullPath); 
    }

    return config;
}

async function validateConfig(config) {
    return Joi.validate(config, schema, {
        presence: 'required'
    });
}

async function loadConfig(path) {
    if (path.endsWith('.json')) {
        return JSON.parse((await readFile(path)).toString());
    }
    
    if (path.endsWith('.js')) {
        return require(path);
    }

    return {};
}

function getPackageConfig(key, def) {
    return process.env['npm_package_config_' + key] || def || '';
};

function getPackageConfigNum(key, def) {
    return parseInt(exports.getPackageConfig(key, String(def || 0)), 10);
}



const process = require('process');
const os = require('os');
const util = require('util');
const url = require('url');
const fs = require('fs');
const Joi = require('joi');
const path = require('path');
const child_process = require('child_process');
const readPackageConfig = require('read-package-config');
const schema = require('./config-schema.js');

const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);
const exists = util.promisify(fs.exists);

const defaultConfigPath = path.resolve(__dirname, '../../config/default-config.js');
const ENV_CONFIG_PREFIX = 'FINAL_PM_CONFIG_';

class ConfigError extends Error {
    constructor(message, path) {
        super(message);
        this.name = 'ConfigError';
        this.path = path;
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
    }, await getGlobalConfig(args));

    if (configPath) {
        const userConfig = await loadConfig(configPath, config);
        
        if ('npm-global-config' in userConfig || 'npm-user-config' in userConfig) {
            throw new ConfigError("npm-global-config and npm-user-config will have no effect if specified\n" +
                                  "in a config file, because they influence the way config files are parsed.\n" +
                                  "Use command line arguments or environment variables.", configPath);
        }

        Object.assign(config, userConfig);
    }
    
    return parseFullConfig(config);
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
            return resolved;
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

async function getGlobalConfig(args) {
    const config = await loadConfig(defaultConfigPath);
    
    await validateConfig(config, true, defaultConfigPath);

    for (const key in process.env) {
        if (!Object.prototype.hasOwnProperty.call(process.env, key))
            continue;
    
        if  (!key.startsWith(ENV_CONFIG_PREFIX))
            continue;

        const configKey = key.slice(ENV_CONFIG_PREFIX.length).toLowerCase().replace(/_/g, '-');

        config[configKey] = process.env[key];
    }
    
    await validateConfig(config, true, "Environment Variables");

    for (const arg of args) {
        const separatorIndex = arg.indexOf('=');

        if (separatorIndex === -1) {
            throw new ConfigError("Expected '=' in " + arg, "CLI Arguments");
        }

        config[arg.slice(0, separatorIndex)] = arg.slice(separatorIndex + 1);
    }

    return validateConfig(config, true, "CLI Arguments");
}

async function parseFullConfig(config) {
    config = await validateConfig(config);

    config.home = path.resolve(config.home);

    const socket = url.parse(config.socket);

    if (socket.protocol === 'tcp:' || socket.protocol === 'http:') {
        config['socket-host'] = socket.hostname;
        config['socket-port'] = socket.port;
        config['socket-path'] = null;
        config['socket'] = 'tcp://' + encodeURIComponent(config['socket-host']) + ':' + config['socket-port'];
    } else if (socket.protocol === 'unix:') {
        const fullPath = socket.host + socket.pathname;
        config['socket-host'] = null;
        config['socket-port'] = null;
        config['socket-path'] = path.resolve(config.home, fullPath); 
        config['socket'] = 'unix://' + config['socket-path'];
    } else {
        throw new ConfigError("Unknown socket protocol: " + socket.protocol, config['config-path']);
    }

    return config;
}

async function validateConfig(config, partial, path) {
    try {
        return await Joi.validate(config, schema, {
            presence: partial ? 'optional' : 'required'
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            throw new ConfigError(error.message, path || config['config-path']);
        }

        throw error;
    }
}

async function loadConfig(path, globalConfig) {
    if (path.endsWith('.json')) {
        try {
            return JSON.parse((await readFile(path)).toString());
        } catch (error) {
            if (error.name === 'SyntaxError') {
                throw new ConfigError(error.message, path);
            }

            throw error;
        }
    }
    
    if (path.endsWith('.js')) {
        return runConfig(path, globalConfig);
    }

    throw new ConfigError("Unknown file extension: " + path, path);
}

async function runConfig(configPath, globalConfig) {
    const env = Object.assign(
        {},
        process.env
    );
    
    if (globalConfig) {
        const packageDir = await findPackageDir(path.dirname(configPath));

        if (packageDir) {
            const config = await readPackageConfig({
                directory: packageDir,
                userConfig: globalConfig['npm-user-config'],
                globalConfig: globalConfig['npm-global-config'],
            });

            for (const key of Object.keys(config)) {
                env['npm_package_config_' + key] = config[key];
            }
        }
    }

    return new Promise((fulfill, reject) => {
        const child = child_process.fork(
            path.join(__dirname, 'config-runner.js'), [configPath], {
                stdio: 'ignore',
                env: env
            }
        );

        child.once('message', function messageListener(message) {
            if (message.error) {
                reject(new ConfigError(message.error, configPath));
            } else {
                fulfill(message.result);
            }
        });
    });
}

async function findPackageDir(dir) {
    const resolved = path.resolve(dir);

    if (await exists(path.join(resolved, 'package.json'))) {
        return resolved;
    }
   
    if (resolved === '/' || resolved === os.homedir()) {
        return null;
    }

    return findPackageDir(path.dirname(resolved));
}

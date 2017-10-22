
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
const defaultApplicationConfigPath = path.resolve(__dirname, '../../config/default-application-config.js');

const ENV_CONFIG_PREFIX = 'FINAL_PM_CONFIG_';
const LOCALHOST = ['localhost', '127.0.0.1', '::1'];

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
    const env = options.env || process.env;
    const configPath = options.path;
    
    const globalConfig = await getGlobalConfig(args);
    const globalApplicationConfig = globalConfig.applications[0];

    globalConfig.applications = [];

    const config = Object.assign({
        'config-path': configPath
    }, globalConfig);

    if (configPath) {
        const userConfig = await loadConfig(configPath, config);
        
        if ('npm-global-config' in userConfig || 'npm-user-config' in userConfig) {
            throw new ConfigError("npm-global-config and npm-user-config will have no effect if specified\n" +
                                  "in a config file, because they influence the way config files are parsed.\n" +
                                  "Use command line arguments or environment variables.", configPath);
        }

        Object.assign(config, userConfig);
    }

    if (config.applications instanceof Array) {
        config.applications = config.applications.map((app) => {
            return Object.assign({}, globalApplicationConfig, app);
        });
    } 

    return parseFullConfig(
        await applyCLIConfigSources(config, env, args));
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

exports.normalizeArray = function(configs) {
    const map = new Map();

    configs.forEach((config) => {
        if (map.has(config.socket)) {
            config.applications = map.get(config.socket).applications.concat(config.applications);
        }

        map.set(config.socket, exports.normalize(config));
    });

    return Array.from(map.values());
};

exports.normalize = function(config) {
    const map = new Map();

    config.applications.forEach((app) => {
        map.set(app.name, app);
    });

    return Object.assign({}, config, {
        applications: Array.from(map.values())
    });
};

async function getGlobalConfig() {
    const config = await loadConfig(defaultConfigPath);
    const applicationConfig = await loadConfig(defaultApplicationConfigPath);

    config['applications'] = [applicationConfig];
    
    return validateConfig(config, false, defaultConfigPath);
}

async function applyCLIConfigSources(config, env, args) {
    config = await validateConfig(config);

    envLoop: for (const key in env) {
        if (!Object.prototype.hasOwnProperty.call(env, key))
            continue;
    
        if  (!key.startsWith(ENV_CONFIG_PREFIX))
            continue;

        const configKey = key.slice(ENV_CONFIG_PREFIX.length).toLowerCase().replace(/_/g, '-');
        const value = parseCLIConfigValue(env[key], "Environment Variables");

        if (configKey in config) {
            config[configKey] = value;
            continue;
        }

        for (let app of config.applications) {
            if (!configKey.startsWith(app.name.toLowerCase() + '-'))
                continue;

            const appKey = configKey.slice(app.name.length + 1);

            if (!(appKey in app))
                continue;

            app[appKey] = value;

            continue envLoop;
        }

        throw new ConfigError(key + " doesn't match any known configuration key.",
            "Environment Variables");
    }
    
    await validateConfig(config, false, "Environment Variables");

    for (const arg of args) {
        const separatorIndex = arg.indexOf('=');

        if (separatorIndex === -1) {
            throw new ConfigError("Expected '=' in " + arg, "CLI Arguments");
        }

        const configKey = arg.slice(0, separatorIndex);
        const value = parseCLIConfigValue(arg.slice(separatorIndex + 1), "CLI Arguments");

        const appSeparatorIndex = configKey.indexOf(':');

        if (appSeparatorIndex === -1) {
            config[configKey] = value;
            continue;
        } 

        const appName = configKey.slice(0, appSeparatorIndex);
        const appKey = configKey.slice(appSeparatorIndex + 1);

        let foundApp = false;
        for (let app of config.applications) {
            if (app.name === appName) {
                app[appKey] = value;
                foundApp = true;
            }
        }

        if (!foundApp) {
            throw new ConfigError(`Unknown application name [bold]{${appName}}`,
                "CLI Arguments");
        }
    }

    return validateConfig(config, false, "CLI Arguments");
}

function parseCLIConfigValue(value, where) {
    const firstChar = value.charAt(0);

    if (firstChar === '"' || firstChar === '[' || firstChar === '{') {
        try {
            return JSON.parse(value);
        } catch (error) {
            if (error.name === 'SyntaxError') {
                throw new ConfigError(error.message + ` '${value}'`, where);
            }

            throw error;
        }
    }

    return value;
}

async function parseFullConfig(config) {
    config = await validateConfig(config);

    config.home = path.resolve(config.home);

    const socket = url.parse(config.socket);

    if (socket.protocol === 'ws:') {
        config['socket-host'] = socket.hostname;
        config['socket-port'] = socket.port;
        config['socket-path'] = null;
        config['is-local'] = LOCALHOST.indexOf(config['socket-host']) !== -1;
        config['socket'] = 'ws://' + encodeURIComponent(config['socket-host']) + ':' + config['socket-port'];
    } else if (socket.protocol === 'ws+unix:') {
        const fullPath = socket.host + socket.pathname;
        config['socket-host'] = null;
        config['socket-port'] = null;
        config['socket-path'] = path.resolve(config.home, fullPath); 
        config['is-local'] = true;
        config['socket'] = 'ws+unix://' + config['socket-path'];
    } else {
        throw new ConfigError("Unknown socket protocol: " + socket.protocol, config['config-path']);
    }

    config['daemon-log'] = path.resolve(config.home, config['daemon-log']);

    config.applications.forEach((app) => {
        if (!app['base-path']) {
            app['base-path'] = config['config-path'] ? path.dirname(config['config-path']) : process.cwd();
        }

        app['base-path'] = path.resolve(app['base-path']);

        app['cwd'] = path.resolve(app['base-path'], app['cwd']);
        app['run'] = path.resolve(app['base-path'], app['run']);
        app['config-path'] = config['config-path'];
    });

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
        Object.assign(env, await createEnv(configPath, globalConfig));
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

async function createEnv(path, globalConfig) {
    const packageDir = await findPackageDir(path);
    const env = {};

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

    return env;
}

async function findPackageDir(dir) {
    const resolved = path.resolve(dir);

    const info = await stat(resolved);

    if (!info.isDirectory()) {
        return findPackageDir(path.dirname(resolved));
    }

    if (await exists(path.join(resolved, 'package.json'))) {
        return resolved;
    }
   
    if (resolved === '/' || resolved === os.homedir()) {
        return null;
    }

    return findPackageDir(path.dirname(resolved));
}

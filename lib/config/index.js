"use strict";

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

exports.ConfigError = ConfigError;

exports.getConfig = async function(options) {
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
            throw new ConfigError("npm-global-config, npm-user-config and ignore-env will have no effect if specified\n" +
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

exports.resolveConfig = async function(configPath) {
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
            return await exports.resolveConfig(path.join(configPath, '../'));
        }

        return paths[0] || null;
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
    const applicationConfig = await loadConfig(defaultApplicationConfigPath, config);

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
        Object.assign(config, {
            'socket-host': socket.hostname,
            'socket-port': socket.port,
            'socket-path': null,
            'is-local': LOCALHOST.indexOf(socket.hostname) !== -1,
            'socket': 'ws://' + encodeURIComponent(socket.hostname) + ':' + socket.port
        });
    } else if (socket.protocol === 'ws+unix:') {
        const socketPath = path.resolve(config['home'], socket.host + socket.pathname);
        Object.assign(config, {
            'socket-host': null,
            'socket-port': null,
            'socket-path': socketPath,
            'is-local': true,
            'socket': 'ws+unix://' + socketPath
        });
    } else {
        throw new ConfigError("Unknown socket protocol: " + socket.protocol, config['config-path']);
    }

    config['daemon-log'] = path.resolve(config.home, config['daemon-log']);

    const defaultBase = config['config-path'] ? path.dirname(config['config-path']) : process.cwd();

    config.applications.forEach((app) => {
        const basePath = path.resolve(app['base-path'] || defaultBase);
        const cwd = path.resolve(basePath, app['cwd']);

        Object.assign(app, {
            'base-path': basePath,
            'cwd': cwd,
            'run': path.resolve(cwd, app['run']),
            'config-path': config['config-path']
        });
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

function configProcessMessageHandler(file, resolve, reject) {
    let result = null;

    this.on('message', function messageListener(message) {
        // If there's an error it always takes precedence
        // over anything we received previously
        if (message.error || !result) {
            result = message;
            return;
        }

        result = {
            error: new ConfigError("Produced a second result; this is a BUG")
        };
    });

    this.once('exit', (code) => {
        if (code) {
            reject(new ConfigError(`Non-zero exit: ${code}`));
            return;
        }

        if (result.error) {
            let error = result.error;

            if (!(error instanceof ConfigError)) {
                error = new ConfigError(result.error.message || "Unknown Error");

                if (result.error.stack) {
                    error.stack = result.error.stack;
                }
            }

            reject(error);

            return;
        }

        resolve(result.result);
    });
}

async function runConfig(configPath, globalConfig) {
    const env = {};

    if (globalConfig) {
        Object.assign(env, await createEnv(configPath, globalConfig));
    } else {
        Object.assign(env, process.env);
    }

    const child = child_process.fork(
        path.join(__dirname, 'config-runner.js'), [configPath], {
            stdio: 'inherit',
            env
        }
    );

    try {
        return await new Promise(
            configProcessMessageHandler.bind(child, configPath));

    } catch (ex) {
        if (ex instanceof ConfigError) {
            throw ex;
        }

        throw new ConfigError(`${ex.message || ex}`, configPath);

    } finally {
        child.removeAllListeners();
    }
}

async function createEnv(path, globalConfig) {
    const packageDir = await findPackageDir(path);
    const env = {};

    const ignore = new Set(globalConfig['ignore-env']);

    for (const key of Object.keys(process.env)) {
        if (ignore.has(key)) {
            continue;
        }

        env[key] = process.env[key];
    }

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

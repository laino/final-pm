"use strict";

const process = require('process');
const os = require('os');
const util = require('util');
const url = require('url');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const readPackageConfig = require('read-package-config');
const configSchema = require('./config-schema.js');
const applicationSchema = require('./application-schema.js');

const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);
const exists = util.promisify(fs.exists);

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '../../config/default-config.js');
const DEFAULT_APPLICATION_CONFIG_PATH = path.resolve(__dirname, '../../config/default-application-config.js');

const ENV_CONFIG_PREFIX = 'FINAL_PM_CONFIG_';
const LOCALHOST = ['localhost', '127.0.0.1', '::1'];

let GLOBAL_CONFIG = null;

class ConfigError extends Error {
    constructor(message, path) {
        super(message);
        this.name = 'ConfigError';
        this.path = path;
    }
}

exports.ConfigError = ConfigError;
exports.configSchema = configSchema;
exports.applicationSchema = applicationSchema;

exports.getConfig = async function(options = {}) {
    if (typeof options === 'string') {
        options = { path: options };
    }

    const args = options.args || [];
    const env = options.env || process.env;
    const configPath = options.path;
    let configEnv = env;

    let globalConfig = Object.assign({}, await getGlobalConfig(args));
    const globalApplicationConfig = globalConfig.applications[0];

    globalConfig.applications = [];
    globalConfig = await applyCLIConfigSources(globalConfig, env, args);

    const config = Object.assign({
        'config-path': configPath
    }, globalConfig);

    if (configPath) {
        configEnv = await createEnv(env, configPath, globalConfig);
        const userConfig = await loadConfig(configPath, configEnv, config);

        if ('npm-global-config' in userConfig || 'npm-user-config' in userConfig) {
            throw new ConfigError("npm-global-config, npm-user-config and ignore-env will have no effect if specified\n" +
                              "in a config file, because they influence the way config files are parsed.\n" +
                              "Use command line arguments or environment variables.", configPath);
        }

        Object.assign(config, userConfig);
    }

    if (config.applications instanceof Array) {
        config.applications = config.applications.map((app) => {
            return Object.assign({}, globalApplicationConfig, {env: configEnv}, app);
        });
    }

    return parseFullConfig(
        await applyCLIConfigSources(config, env, args, true));
};

exports.resolveConfig = async function(configPath) {
    const resolved = path.resolve(configPath);
    const parent = path.dirname(resolved);

    let checkParent = resolved !== os.homedir() &&
                      parent !== resolved;

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
            return await exports.resolveConfig(parent);
        }

        return paths[0] || null;
    } catch (error) {
        /* istanbul ignore if */
        if (error.code !== 'ENOENT') {
            throw error;
        }

        return null;
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

function getGlobalConfig() {
    if (GLOBAL_CONFIG) {
        return GLOBAL_CONFIG;
    }

    return GLOBAL_CONFIG = (async () => {
        const config = await loadConfig(DEFAULT_CONFIG_PATH, {});
        const applicationConfig = await loadConfig(DEFAULT_APPLICATION_CONFIG_PATH, {}, config);

        config['applications'] = [applicationConfig];

        return await validateConfig(config, DEFAULT_CONFIG_PATH);
    })();
}

async function applyCLIConfigSources(config, env, args, exact) {
    config = await validateConfig(config);

    envLoop: for (const key of Object.keys(env)) {
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

            if (!Object.prototype.hasOwnProperty.call(app, appKey))
                continue;

            app[appKey] = value;

            continue envLoop;
        }

        if (exact) {
            throw new ConfigError(key + " doesn't match any known configuration key.",
                "Environment Variables");
        }
    }

    await validateConfig(config, "Environment Variables");

    for (const arg of args) {
        const separatorIndex = arg.indexOf('=');

        if (separatorIndex === -1) {
            throw new ConfigError("Expected '=' in " + arg, "CLI Arguments");
        }

        const configKey = arg.slice(0, separatorIndex);
        const value = parseCLIConfigValue(arg.slice(separatorIndex + 1), "CLI Arguments");

        const appSeparatorIndex = configKey.indexOf(':');

        if (appSeparatorIndex === -1) {
            if (!Object.prototype.hasOwnProperty.call(config, configKey)) {
                throw new ConfigError(configKey + " doesn't match any known configuration key.",
                    "CLI Arguments");
            }

            config[configKey] = value;

            continue;
        }

        const appName = configKey.slice(0, appSeparatorIndex);
        const appKey = configKey.slice(appSeparatorIndex + 1);

        let foundApp = false;
        for (let app of config.applications) {
            if (app.name !== appName) {
                continue;
            }

            if (!Object.prototype.hasOwnProperty.call(app, appKey)) {
                throw new ConfigError(appKey + " doesn't match any known application configuration key.",
                    "CLI Arguments");
            }

            app[appKey] = value;
            foundApp = true;
        }

        if (!foundApp && exact) {
            throw new ConfigError(`Unknown application name: ${appName}`,
                "CLI Arguments");
        }
    }

    return validateConfig(config, "CLI Arguments");
}

function parseCLIConfigValue(value, where) {
    const firstChar = value.charAt(0);

    if (firstChar === '"' || firstChar === '[' || firstChar === '{') {
        try {
            return JSON.parse(value);
        } catch (error) {
            /* istanbul ignore if */
            if (error.name !== 'SyntaxError') {
                throw error;
            }

            throw new ConfigError(error.message + ` '${value}'`, where);
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
        if (os.platform() === 'win32') {
            throw new ConfigError(
                "Unix domain sockets are unsupported on Windows platforms. " +
                "Bind to a port instead.", config['config-path']);
        }

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
        if (app['mode'] === 'fork' && app['ready-on'] === 'listen') {
            throw new ConfigError("ready-on = 'listen' is only supported in cluster mode. " +
                                  "Change ready-on to 'message' or mode to 'cluster'", config['config-path']);
        }

        if (app['max-instances'] > 0 && app['max-instances'] <= app['instances']) {
            throw new ConfigError("max-instances must be larger than instances.", config['config-path']);
        }

        if (os.platform() === 'win32' && app['stop-signal'] === 'SIGINT') {
            throw new ConfigError(
                "Sending SIGINT is not supported on Windows platforms. " +
                "Use stop-signal = 'message' instead.", config['config-path']);
        }

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

async function validateConfig(config, path) {
    const {error, value} = await configSchema.validate(config, {
        presence: 'required'
    });

    if (error) {
        throw new ConfigError(error, path || config['config-path']);
    }

    return value;
}

async function loadConfig(path, env, globalConfig) {
    if (path.endsWith('.json')) {
        try {
            return JSON.parse((await readFile(path)).toString());
        } catch (error) {
            /* istanbul ignore if */
            if (error.name !== 'SyntaxError') {
                throw error;
            }

            throw new ConfigError(error.message, path);
        }
    }

    if (path.endsWith('.js')) {
        return runConfig(path, env, globalConfig);
    }

    throw new ConfigError("Unknown file extension: " + path, path);
}

function configProcessMessageHandler(file, resolve, reject) {
    let result = null;

    this.on('message', function messageListener(message) {
        if (result && result.error) {
            return;
        }

        // If there's an error it takes precedence
        if (message.error || !result) {
            result = message;
            return;
        }

        result = {
            error: new ConfigError("Config process produced a second result", file)
        };
    });

    this.once('exit', (code) => {
        if (code && (!result || !result.error)) {
            reject(new ConfigError(`Config process terminated with non-zero exit code: ${code}`));
            return;
        }

        if (!result) {
            reject(new ConfigError("Config process terminated without any result", file));
            return;
        }

        if (result.error) {
            let error = result.error;

            if (!(error instanceof ConfigError)) {
                error = new ConfigError(result.error.message || "Unknown Error", file);

                /* istanbul ignore if */
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

async function runConfig(configPath, env) {
    const child = child_process.fork(
        path.join(__dirname, 'config-runner.js'), [configPath], {
            stdio: 'inherit',
            env
        }
    );

    try {
        return await new Promise(
            configProcessMessageHandler.bind(child, configPath));
    } finally {
        child.removeAllListeners();
    }
}

async function createEnv(baseEnv, path, globalConfig) {
    const packageDir = await findPackageDir(path);
    const env = Object.assign({}, baseEnv);

    for (const key of globalConfig['ignore-env']) {
        env[key] = '';
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

    const parent = path.dirname(resolved);

    if (resolved === parent || resolved === os.homedir()) {
        return null;
    }

    return findPackageDir(parent);
}

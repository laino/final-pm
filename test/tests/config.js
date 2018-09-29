
const common = require('../common');
const finalPM = require('../../');
const path = require('path');
const os = require('os');
const {assert, expect} = require('chai');
const ConfigError = finalPM.config.ConfigError;

describe('config', function() {
    const JS_CONFIG = path.resolve(__dirname, '..', 'configs', 'working.js');
    const JS_FN_CONFIG = path.resolve(__dirname, '..', 'configs', 'working-fn.js');
    const JS_PROMISE_CONFIG = path.resolve(__dirname, '..', 'configs', 'working-promise.js');
    const JS_PROMISE_FN_CONFIG = path.resolve(__dirname, '..', 'configs', 'working-promise-fn.js');
    const JSON_CONFIG = path.resolve(__dirname, '..', 'configs', 'working.json');

    const EMPTY = path.resolve(__dirname, '..', 'configs', 'empty.json');

    const OTHER1 = path.resolve(__dirname, '..', 'configs', 'stdout.js');

    const MALFORMED_CONFIGS = [
        ['broken1.json', 'Unexpected token'],
        ['broken2.json', '$$$ERROR$$$'],
        ['broken3.json', 'app/0'],
        ['broken4.js', '$$$ERROR$$$'],
        ['broken5.js', '$$$ERROR$$$'],
        ['broken6.js', '$$$ERROR$$$'],
        ['broken7.js', '$$$ERROR$$$'],
        ['broken8.js', '$$$ERROR$$$'],
        ['broken9.json', 'will have no effect'],
        ['broken10.json', 'only supported in cluster mode'],
        ['broken11.json', 'max-instances must be larger'],
        ['broken12.json', 'must be an array'],
        ['broken13.js', 'non-zero exit code'],
        ['broken14.js', 'without any result'],
        ['broken15.js', 'produced a second result'],
        ['broken16.js', 'Unknown Error'],
        ['invalid-extension.ASF', 'Unknown file extension'],
        ['404.json', 'ENOENT', Error]
    ];

    async function testConfig(configPath) {
        const config = await finalPM.config.getConfig(configPath);
        let compareTo = require(configPath);

        if (typeof compareTo === 'function') {
            compareTo = compareTo();
        }

        if (typeof compareTo.then === 'function') {
            compareTo = await compareTo;
        }

        assert.equal(config['config-path'], configPath,
            "Contains the full configuration path");

        compareTo.applications = compareTo.applications || [];

        assert.equal(config.applications.length, compareTo.applications.length,
            "Contain the same number of configurations");

        for (let app of compareTo.applications) {
            app = Object.assign({}, app);

            delete app.run; // Gets resolved to some full path

            assert.equal(common.matchingObjects(config.applications, app).length, 1,
                "Contains each app config exactly once");
        }
    }

    function stripPaths(config) {
        delete config['config-path'];

        for (const app of config.applications) {
            delete app['config-path'];
        }
    }

    it('should return the global config when called without a path', async function() {
        const config = await finalPM.config.getConfig();

        assert.equal(config['config-path'], null, 'global config should have no config path');
        assert.equal(config.applications.length, 0, 'global config should have no applications');
    });

    it('should resolve configuration files', async function() {
        const dirPath = path.resolve(__dirname, '..', 'configs', 'dir');
        const childPath = path.resolve(dirPath, 'child');
        const directPath = path.resolve(dirPath, 'process-config.js');
        const wrongPath1 = path.resolve(os.homedir());
        const wrongPath2 = path.resolve('/INVALID');
        const wrongPath3 = path.resolve(childPath, 'process-config.js');

        const path1 = await finalPM.config.resolveConfig(dirPath);

        assert.equal(path1, directPath,
            `config file was resolved using its directory`);

        const path2 = await finalPM.config.resolveConfig(childPath);

        assert.equal(path2, directPath,
            `config file was resolved using a child directory`);

        const path3 = await finalPM.config.resolveConfig(directPath);

        assert.equal(path3, directPath,
            `config file was resolved using its direct path`);

        const path4 = await finalPM.config.resolveConfig(wrongPath1);

        assert.equal(path4, null,
            `return null when no config file was found in target directory`);

        const path5 = await finalPM.config.resolveConfig(wrongPath2);

        assert.equal(path5, null,
            `return null when an invalid directory was specified`);

        const path6 = await finalPM.config.resolveConfig(wrongPath3);

        assert.equal(path6, null,
            `return null when an config file doesn't exist`);
    });

    it('should load JavaScript configuration files correctly', async function() {
        await testConfig(JS_CONFIG);
        await testConfig(JS_PROMISE_CONFIG);
        await testConfig(JS_FN_CONFIG);
    });

    it('should load JSON configuration files correctly', async function() {
        await testConfig(JSON_CONFIG);
        await testConfig(EMPTY);
    });

    it('should parse JS and JSON configuration files the same', async function() {
        const JS = await finalPM.config.getConfig(JS_CONFIG);
        const JS_PROMISE = await finalPM.config.getConfig(JS_PROMISE_CONFIG);
        const JS_PROMISE_FN = await finalPM.config.getConfig(JS_PROMISE_FN_CONFIG);
        const JS_FN = await finalPM.config.getConfig(JS_FN_CONFIG);
        const JSON = await finalPM.config.getConfig(JSON_CONFIG);

        stripPaths(JS);
        stripPaths(JS_PROMISE);
        stripPaths(JS_PROMISE_FN);
        stripPaths(JS_FN);
        stripPaths(JSON);

        assert.deepEqual(JS, JSON, "JS and JSON configs should be the same");
        assert.deepEqual(JS_PROMISE, JSON, "JS (promise) and JSON configs should be the same");
        assert.deepEqual(JS_FN, JSON, "JS (function) and JSON configs should be the same");
        assert.deepEqual(JS_PROMISE_FN, JSON, "JS (promise + function) and JSON configs should be the same");
    });

    it('should normalize configurations', async function() {
        const config1 = await finalPM.config.getConfig(JS_CONFIG);
        const config2 = await finalPM.config.getConfig(OTHER1);

        const normalized = finalPM.config.normalizeArray([config1, config2]);

        assert.equal(normalized.length, 1);
    });

    it('should reject malformed configurations', async function() {
        for (const [name, err, errorClass] of MALFORMED_CONFIGS) {
            const configPath = path.resolve(__dirname, '..', 'configs', name);

            await expect(finalPM.config.getConfig(configPath))
                .to.be.rejectedWith(errorClass || ConfigError, err);
        }
    });

    it('should overwrite config values from CLI and ENV', async function() {
        const CLI = await finalPM.config.getConfig({
            path: JS_CONFIG,
            args: ['app:logger=fake-logger', 'app:logger-args=["CUSTOM"]']
        });

        assert.equal(common.matchingObjects(CLI.applications, {
            'logger': 'fake-logger',
            'logger-args': ['CUSTOM'],
        }).length, 1, "overwrite config values with CLI arguments");

        const ENV = await finalPM.config.getConfig({
            path: JS_CONFIG,
            env: {
                SOMETHING_ELSE: 'hi',
                FINAL_PM_CONFIG_APP_LOGGER: 'fake-logger',
                FINAL_PM_CONFIG_APP_LOGGER_ARGS: '["CUSTOM"]'
            }
        });

        assert.equal(common.matchingObjects(ENV.applications, {
            'logger': 'fake-logger',
            'logger-args': ['CUSTOM'],
        }).length, 1, "overwrite config values with ENV");
    });

    it('should reject malformed config from CLI and ENV', async function() {
        function getBrokenConfigA() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                env: {
                    FINAL_PM_CONFIG_APP_UNKNOWN_KEY: 'value',
                }
            });
        }

        function getBrokenConfigB() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                args: ['app:unknown-key=value']
            });
        }

        function getBrokenConfigC() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                args: ['unknown-key=value']
            });
        }

        function getBrokenConfigD() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                args: ['unknown-app:logger=fake-logger']
            });
        }

        function getBrokenConfigE() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                args: ['unknown']
            });
        }

        function getBrokenConfigF() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                env: {
                    FINAL_PM_CONFIG_APP_LOGGER: '"asdf',
                }
            });
        }
        function getBrokenConfigG() {
            return finalPM.config.getConfig({
                path: JS_CONFIG,
                args: ['app:logger="asdf']
            });
        }

        await expect(getBrokenConfigA()).to.be.rejectedWith(ConfigError,
            "doesn't match any known configuration key");

        await expect(getBrokenConfigB()).to.be.rejectedWith(ConfigError,
            "doesn't match any known application configuration key");

        await expect(getBrokenConfigC()).to.be.rejectedWith(ConfigError,
            "doesn't match any known configuration key");

        await expect(getBrokenConfigD()).to.be.rejectedWith(ConfigError,
            "Unknown application name");

        await expect(getBrokenConfigE()).to.be.rejectedWith(ConfigError,
            "Expected '='");

        await expect(getBrokenConfigF()).to.be.rejectedWith(ConfigError,
            "Unexpected end of JSON input");

        await expect(getBrokenConfigG()).to.be.rejectedWith(ConfigError,
            "Unexpected end of JSON input");
    });

    it('should read config values from a package.json and npm config', async function() {
        const JS = await finalPM.config.getConfig(JS_CONFIG);

        assert.equal(JS.applications[0].env['npm_package_config_test'], 'a',
            "Config values from package.json appear in application envirnment.");

        const JS_ARGS_USER = await finalPM.config.getConfig({
            path: JS_CONFIG,
            args: ['npm-user-config=' + path.resolve(__dirname, '..', 'configs', 'customconfig')]
        });

        assert.equal(JS_ARGS_USER.applications[0].env['npm_package_config_test'], 'b',
            "CLI: Custom user config can override package.json config values.");

        const JS_ENV_USER = await finalPM.config.getConfig({
            path: JS_CONFIG,
            env: {'FINAL_PM_CONFIG_NPM_USER_CONFIG': path.resolve(__dirname, '..', 'configs', 'customconfig')}
        });

        assert.equal(JS_ENV_USER.applications[0].env['npm_package_config_test'], 'b',
            "ENV: Custom user config can override package.json config values.");

        const JS_ARGS_GLOBAL = await finalPM.config.getConfig({
            path: JS_CONFIG,
            args: ['npm-global-config=' + path.resolve(__dirname, '..', 'configs', 'customconfig')]
        });

        assert.equal(JS_ARGS_GLOBAL.applications[0].env['npm_package_config_test'], 'b',
            "CLI: Custom global config can override package.json config values.");

        const JS_ENV_GLOBAL = await finalPM.config.getConfig({
            path: JS_CONFIG,
            env: {'FINAL_PM_CONFIG_NPM_GLOBAL_CONFIG': path.resolve(__dirname, '..', 'configs', 'customconfig')}
        });

        assert.equal(JS_ENV_GLOBAL.applications[0].env['npm_package_config_test'], 'b',
            "ENV: Custom global config can override package.json config values.");
    });
});


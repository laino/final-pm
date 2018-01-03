
const common = require('../common');
const finalPM = require('../../');
const path = require('path');
const {assert, expect} = require('chai');

describe('config', function() {
    const JS_CONFIG = path.resolve(__dirname, '..', 'configs', 'working.js');
    const JS_FN_CONFIG = path.resolve(__dirname, '..', 'configs', 'working-fn.js');
    const JS_PROMISE_CONFIG = path.resolve(__dirname, '..', 'configs', 'working-promise.js');
    const JS_PROMISE_FN_CONFIG = path.resolve(__dirname, '..', 'configs', 'working-promise-fn.js');
    const JSON_CONFIG = path.resolve(__dirname, '..', 'configs', 'working.json');

    const MALFORMED_CONFIGS = [
        ['broken1.json', 'Unexpected token'],
        ['broken2.json', '$$$ERROR$$$'],
        ['broken3.json', 'app/0'],
        ['broken4.js', '$$$ERROR$$$'],
        ['broken5.js', '$$$ERROR$$$'],
        ['broken6.js', '$$$ERROR$$$'],
        ['broken7.js', '$$$ERROR$$$']
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

    it('should load JavaScript configuration files correctly', async function() {
        await testConfig(JS_CONFIG);
        await testConfig(JS_PROMISE_CONFIG);
        await testConfig(JS_FN_CONFIG);
    });

    it('should load JSON configuration files correctly', async function() {
        await testConfig(JSON_CONFIG);
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

    it('should reject malformed configurations', async function() {
        const ConfigError = finalPM.config.ConfigError;

        for (const [name, err] of MALFORMED_CONFIGS) {
            const configPath = path.resolve(__dirname, '..', 'configs', name);

            await expect(finalPM.config.getConfig(configPath))
                .to.be.rejectedWith(ConfigError, err);
        }
    });
});


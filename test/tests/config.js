
const common = require('../common');
const finalPM = require('../../');
const path = require('path');
const {assert, expect} = require('chai');

describe('config', function() {
    const JS_CONFIG = path.resolve(__dirname, '..', 'configs', 'working.js');
    const JSON_CONFIG = path.resolve(__dirname, '..', 'configs', 'working.json');

    const MALFORMED_CONFIG1 = path.resolve(__dirname, '..', 'configs', 'broken1.json');
    const MALFORMED_CONFIG2 = path.resolve(__dirname, '..', 'configs', 'broken2.json');
    const MALFORMED_CONFIG3 = path.resolve(__dirname, '..', 'configs', 'broken3.json');

    async function testConfig(configPath) {
        const config = await finalPM.config.getConfig(configPath);
        const compareTo = require(configPath);

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
    });

    it('should load JSON configuration files correctly', async function() {
        await testConfig(JSON_CONFIG);
    });

    it('should parse JS and JSON configuration files the same', async function() {
        const JS = await finalPM.config.getConfig(JS_CONFIG);
        const JSON = await finalPM.config.getConfig(JSON_CONFIG);

        stripPaths(JS);
        stripPaths(JSON);

        assert.deepEqual(JS, JSON, "JS and JSON configs should be the same");
    });

    it('should reject malformed configurations', async function() {
        const ConfigError = finalPM.config.ConfigError;

        await expect(finalPM.config.getConfig(MALFORMED_CONFIG1))
            .to.be.rejectedWith(ConfigError, 'Unexpected token');

        await expect(finalPM.config.getConfig(MALFORMED_CONFIG2))
            .to.be.rejectedWith('$$$ERROR$$$');

        await expect(finalPM.config.getConfig(MALFORMED_CONFIG3))
            .to.be.rejectedWith(ConfigError, 'app/0');
    });
});


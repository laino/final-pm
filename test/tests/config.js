
const common = require('../common');
const assert = require('assert');
const finalPM = require('../../');

describe('config', function() {
    it('should load JavaScript configuration files correctly', async function() {
        const config = await finalPM.config.getConfig(common.sampleConfigPath);
        const compareTo = require(common.sampleConfigPath);

        assert.equal(config['config-path'], common.sampleConfigPath,
            "Contains the full configuration path");

        for (let app of compareTo.applications) {
            app = Object.assign({}, app);

            delete app.run; // Gets resolved to some full path

            assert.equal(common.matchingObjects(config.applications, app).length, 1,
                "Contains each app config exactly once");
        }
    });
});

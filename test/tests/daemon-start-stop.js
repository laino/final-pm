
const common = require('../common');
const assert = require('assert');
const util = require('util');
const fs = require('fs');

describe('daemon', function() {
    it('should start and stop', async function() {
        const daemon = await common.daemon();

        await daemon.killDaemon();
    });

    it('should listen to unix sockets', async function() {
        const daemon = await common.daemon();

        const file = common.tmp();
        const exists = util.promisify(fs.exists);

        await daemon.listen('ws+unix://' + file);

        assert.equal(await exists(file), true);

        await daemon.close();

        assert.equal(await exists(file), false);

        await daemon.killDaemon();
    });
});

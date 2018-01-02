
const common = require('../common');
const assert = require('assert');

describe('daemon', function() {
    it('should start and stop', async function() {
        const daemon = await common.daemon();

        await daemon.killDaemon();
    });

    it('should listen to unix sockets', async function() {
        const daemon = await common.daemon();

        const file = common.tmp();

        await daemon.listen('ws+unix://' + file);

        assert.equal(await common.exists(file), true);

        await daemon.close();

        assert.equal(await common.exists(file), false);

        await daemon.killDaemon();
    });

    it('should load configurations', async function() {
        const daemon = await common.daemon();
        const samples = await common.samples();

        samples.forEach((sample) => {
            daemon.add(sample);
        });

        const names = new Set(daemon.info().applications
            .filter((app) => !app.builtin)
            .map((app) => app.name));

        samples.forEach((sample) => {
            assert.equal(names.has(sample.name), true);
            names.delete(sample.name);
        });

        assert.equal(names.size, 0);

        await daemon.killDaemon();
    });
});

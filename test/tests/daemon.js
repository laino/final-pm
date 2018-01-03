
const common = require('../common');
const assert = require('chai').assert;

describe('daemon', function() {
    it('should start and stop', async function() {
        const daemon = await common.daemon();

        await daemon.killDaemon();
    });

    it('should listen to unix sockets', async function() {
        const daemon = await common.daemon();

        const file = common.tmp();

        await daemon.listen('ws+unix://' + file);

        assert.equal(await common.exists(file), true,
            "unix socket exists");

        await daemon.close();

        assert.equal(await common.exists(file), false,
            "unix socket was removed");

        await daemon.killDaemon();
    });

    it('should load configurations', async function() {
        const daemon = await common.daemon();
        const samples = await common.loadConfig();

        samples.forEach((sample) => {
            daemon.add(sample);
        });

        const names = new Set(daemon.info().applications
            .filter((app) => !app.builtin)
            .map((app) => app.name));

        samples.forEach((sample) => {
            assert.equal(names.has(sample.name), true, sample.name + " config exists");
            names.delete(sample.name);
        });

        assert.equal(names.size, 0, "no extranous configs exist");

        await daemon.killDaemon();
    });

    it('should start/stop apps and their loggers', async function() {
        const daemon = await common.daemonWithConfig();

        daemon.start('app');

        await daemon.wait();

        let info = daemon.info();

        const runningApp = common.matchingObjects(info.processes, {
            'generation': 'running',
            'app-name': 'app',
            'crashes': 0
        });

        assert.equal(1, runningApp.length, "one instance of 'app' is running");

        assert.equal(1, common.matchingObjects(info.processes, {
            'generation': 'running',
            'app-name': 'file-logger',
            'crashes': 0
        }).length, "one instance of 'file-logger' is running");

        daemon.stop({id: runningApp[0].id});

        await daemon.wait();

        info = daemon.info();

        assert.equal(info.processes.length, 0, "everything was stopped");

        await daemon.killDaemon();
    });
});

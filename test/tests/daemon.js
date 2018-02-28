
const common = require('../common');
const {assert, expect} = require('chai');

describe('daemon', function() {
    it('should start and stop', async function() {
        const daemon = await common.daemon();

        await daemon.killDaemon();
    });

    it('should listen to unix sockets', async function() {
        if (common.isWindows()) {
            return;
        }

        const daemon = await common.daemon();

        // Close default socket
        await daemon.close();

        const file = common.tmp();

        await daemon.listen('ws+unix://' + file);

        assert.equal(await common.exists(file), true,
            "unix socket exists");

        await daemon.close();

        assert.equal(await common.exists(file), false,
            "unix socket was removed");

        await daemon.killDaemon();
    });

    it('should reject malformed API calls', async function() {
        const daemon = await common.daemon();
        const client = await common.client(daemon);

        await expect(client.invoke("info", "derp"))
            .to.be.rejectedWith('Arguments mismatch');

        await expect(client.invoke("404"))
            .to.be.rejectedWith('no such method');

        await expect(client.invoke("start"))
            .to.be.rejectedWith('Arguments mismatch');

        await client.close();
        await daemon.killDaemon();
    });

    it('should load configurations', async function() {
        const daemon = await common.daemon();
        const client = await common.client(daemon);
        const samples = await common.loadConfig();

        for (const sample of samples) {
            await client.invoke('add', sample);
        }

        const info = await client.invoke('info');

        const names = new Set(info.applications
            .filter((app) => !app.builtin)
            .map((app) => app.name));

        samples.forEach((sample) => {
            assert.equal(names.has(sample.name), true, sample.name + " config exists");
            names.delete(sample.name);
        });

        assert.equal(names.size, 0, "no extranous configs exist");

        await client.close();
        await daemon.killDaemon();
    });

    async function startStopTest(daemon) {
        const client = await common.client(daemon);

        await client.invoke('all', [
            { name: 'start', args: ['app'] },
            { name: 'wait' },
        ]);

        let info = await client.invoke('info');

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

        await client.invoke('stop', runningApp[0].id);
        await client.invoke('wait');

        info = await client.invoke('info');

        assert.equal(info.processes.length, 0, "everything was stopped");

        await client.close();
        await daemon.killDaemon();
    }

    it('should start/stop apps and their loggers in cluster mode', async function() {
        const daemon = await common.daemonWithConfig();
        await startStopTest(daemon);
    });

    it('should start/stop apps and their loggers in fork mode', async function() {
        const daemon = await common.daemonWithConfig('working-fork.js');
        await startStopTest(daemon);
    });

    async function restartCrashingTest(daemon) {
        const client = await common.client(daemon);

        await client.invoke('start', 'crashingApp');

        await common.wait(1500);

        let crashingApp = common.matchingObjects((await client.invoke('info')).processes, {
            'app-name': 'crashingApp',
        });

        assert.equal(1, crashingApp.length, "one instance of 'crashingApp' is running");

        crashingApp = crashingApp[0];

        assert.notEqual(0, crashingApp.crashes, "was restart at least once");

        await client.close();
        await daemon.killDaemon();
    }

    it('should restart crashing applications in cluster mode', async function() {
        this.timeout(3000);

        const daemon = await common.daemonWithConfig();
        await restartCrashingTest(daemon);
    });

    it('should restart crashing applications in fork mode', async function() {
        this.timeout(3000);

        const daemon = await common.daemonWithConfig('working-fork.js');
        await restartCrashingTest(daemon);
    });
});

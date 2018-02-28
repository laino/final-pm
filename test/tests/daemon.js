
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

    async function startStopTestSingleApp(client, appName) {
        await client.invoke('all', [
            { name: 'start', args: [appName] },
            { name: 'wait' },
        ]);

        let info = await client.invoke('info');

        const runningApp = common.matchingObjects(info.processes, {
            'generation': 'running',
            'app-name': appName,
            'crashes': 0
        });

        assert.equal(runningApp.length, 1, `one instance of '${appName}' is running`);

        assert.equal(common.matchingObjects(info.processes, {
            'generation': 'running',
            'app-name': 'file-logger',
            'crashes': 0
        }).length, 1, `one instance of 'file-logger' for ${appName} is running`);

        await client.invoke('stop', runningApp[0].id);
        await client.invoke('wait');

        info = await client.invoke('info');

        assert.equal(info.processes.length, 0, `instance of ${appName} was stopped`);
    }

    async function startStopTest(daemon) {
        const client = await common.client(daemon);

        await startStopTestSingleApp(client, 'app');
        await startStopTestSingleApp(client, 'app-listen');
        await startStopTestSingleApp(client, 'app-instant');

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

        assert.equal(crashingApp.length, 1, "one instance of 'crashingApp' is running");

        crashingApp = crashingApp[0];

        assert.notEqual(crashingApp.crashes, 0, "was restart at least once");

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

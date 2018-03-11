
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
        }).length, 1, `one instance of 'file-logger' for '${appName}' is running`);

        await client.invoke('stop', runningApp[0].id);
        await client.invoke('wait');

        info = await client.invoke('info');

        assert.equal(info.processes.length, 0, `instances of '${appName}' and 'file-logger' were stopped`);
    }

    inAllModes(async function(getDaemon) {
        it('should start/stop apps and their loggers', async function() {
            this.timeout(4000);

            const daemon = await getDaemon();
            const client = await common.client(daemon);

            await startStopTestSingleApp(client, 'app');
            await startStopTestSingleApp(client, 'app-listen');
            await startStopTestSingleApp(client, 'app-instant');
            await startStopTestSingleApp(client, 'app-message');

            await client.close();
            await daemon.killDaemon();
        });

        it('should restart crashing applications', async function() {
            const daemon = await getDaemon();

            const client = await common.client(daemon);

            await client.invoke('start', 'app');
            await client.invoke('wait');

            let crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'app',
            });
            let crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1, "one instance of 'app' is running");

            process.kill(crashingApp.pid, 'SIGKILL');

            await common.wait(100);
            await client.invoke('wait');

            crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'app',
            });
            crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1, "one instance of 'app' is running");
            assert.equal(crashingApp.crashes, 1, "was restartet once");

            await client.close();
            await daemon.killDaemon();
        });

        it('should queue instances when max-instances is reached', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            await client.invoke('all', [
                { name: 'start', args: ['neverStarts'] },
                { name: 'start', args: ['neverStarts'] },
                { name: 'start', args: ['neverStarts'] }
            ]);

            let info = await client.invoke('info');

            let starting = common.matchingObjects(info.processes, {
                'generation': 'new',
                'app-name': 'neverStarts',
                'crashes': 0
            });

            assert.equal(starting.length, 2, `two instances of 'neverStarts' are starting`);

            assert.equal(common.matchingObjects(info.processes, {
                'generation': 'queue',
                'app-name': 'neverStarts',
                'crashes': 0
            }).length, 1, `one instance of 'neverStarts' is queued`);

            await client.invoke('kill', starting[0].id);

            // need to wait for the process to actually exit...
            await common.wait(100);

            info = await client.invoke('info');
            starting = common.matchingObjects(info.processes, {
                'generation': 'new',
                'app-name': 'neverStarts',
                'crashes': 0
            });

            assert.equal(starting.length, 2, `two instances of 'neverStarts' are starting after killing one`);

            assert.equal(common.matchingObjects(info.processes, {
                'generation': 'queue',
                'app-name': 'neverStarts',
                'crashes': 0
            }).length, 0, `no instance of 'neverStarts' is queued after killing one`);

            await client.close();
            await daemon.killDaemon();
        });
    });
});

function inAllModes(fn) {
    context('in cluster mode', function() {
        fn.call(this, () => {
            return common.daemonWithConfig();
        });
    });

    context('in fork mode', function() {
        fn.call(this, () => {
            return common.daemonWithConfig('working-fork.js');
        });
    });
}

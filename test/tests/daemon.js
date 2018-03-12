
const finalPM = require('../../');
const common = require('../common');
const fs = require('fs');
const util = require('util');
const {assert, expect} = require('chai');
const writeFile = util.promisify(fs.writeFile);

describe('daemon', function() {
    it('should start and stop within the test environment', async function() {
        const daemon = await common.daemon();
        await daemon.killDaemon();
    });

    it('should start and stop as a seperate process', async function() {
        const launchConfig = await common.tmplaunchconfig();

        await finalPM.daemon.launch(launchConfig);

        const client = await finalPM.client.connect(launchConfig['socket']);

        await client.invoke('killDaemon');

        await client.close();
    });

    it('should fail when a daemon is already running', async function() {
        const launchConfig = await common.tmplaunchconfig();

        await finalPM.daemon.launch(launchConfig);

        await expect(finalPM.daemon.launch(launchConfig))
            .to.be.rejectedWith("Daemon already running");

        const client = await finalPM.client.connect(launchConfig['socket']);

        await client.invoke('killDaemon');

        await client.close();
    });

    it('detect dead unix domain sockets', async function() {
        if (common.isWindows()) {
            return;
        }

        const launchConfig = await common.tmplaunchconfig();

        await writeFile(launchConfig['socket-path'], '');

        await finalPM.daemon.launch(launchConfig);

        const client = await finalPM.client.connect(launchConfig['socket']);

        await client.invoke('killDaemon');

        await client.close();
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

        await expect(client.invoke("start", 3))
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

        let info = await client.invoke('info');

        const oldApps = info.applications.filter((app) => !app.builtin);
        const names = new Set(oldApps.map((app) => app.name));

        samples.forEach((sample) => {
            assert.equal(names.has(sample.name), true, sample.name + " config exists");
            names.delete(sample.name);
        });

        assert.equal(names.size, 0, "no extranous configs exist");

        for (const sample of samples) {
            sample.logger = "404";
            await client.invoke('add', sample);
        }

        info = await client.invoke('info');

        info.applications.filter((app) => !app.builtin).forEach((app, i) => {
            assert.equal(app['name'] == oldApps[i]['name'], true,
                `apps are still in the same order`);

            assert.equal(app.revision > oldApps[i].revision, true,
                `revision counter of ${app['name']} was incremented`);
        });

        for (const sample of samples) {
            await client.invoke('delete', sample['name']);
        }

        info = await client.invoke('info');

        assert.equal(
            info.applications.filter((app) => !app.builtin).length, 0,
            `all configurations were removed`);


        await client.close();
        await daemon.killDaemon();
    });

    it('discards old log lines in RAM', async function() {
        const daemon = await common.daemonWithConfig('stdout.js');
        const client = await common.client(daemon);

        await client.invoke('start', 'spammy');
        await client.invoke('wait');
        await common.wait(200);

        const logs = (await client.invoke('logs', 'spammy', {
            lines: 1000
        })).lines.filter((line) => line.type === 'stdout');

        assert.equal(logs.length <= 2, true,
            `two or less log line should fit into RAM`);

        await client.close();
        await daemon.killDaemon();
    });

    it('discards logs after some time', async function() {
        const daemon = await common.daemonWithConfig('stdout.js');
        const client = await common.client(daemon);

        let result = await client.invoke('start', 'expire');
        await client.invoke('wait');
        await client.invoke('stop', result.process.id);
        await client.invoke('wait');

        // Immediately start a new app, aborting the timeout
        result = await client.invoke('start', 'expire');
        await client.invoke('wait');

        await common.wait(500);

        assert.notEqual(
            (await client.invoke('logs', 'expire')).lines.length, 0,
            `shouldn't have discarded logs`);

        await client.invoke('stop', result.process.id);
        await client.invoke('wait');

        await common.wait(500);

        assert.equal(
            (await client.invoke('logs', 'expire')).lines.length, 0,
            `should've discarded logs`);

        await client.close();
        await daemon.killDaemon();
    });

    it('correctly logs multiple lines received at once or apart', async function() {
        const daemon = await common.daemonWithConfig('stdout.js');
        const client = await common.client(daemon);

        await client.invoke('start', 'app');
        await client.invoke('wait');
        await client.invoke('stop', 0);
        await client.invoke('wait');

        const logs = (await client.invoke('logs', 'app'))
            .lines.filter((line) => line.type === 'stdout');

        assert.equal(logs.length, 3, `logged 3 lines`);

        assert.deepEqual(logs.map((line) => line.text),
            ['TWO LINES', 'AT ONCE', 'A LINE IN TWO PARTS'],
            `logged everything and in the right order`);

        await client.close();
        await daemon.killDaemon();
    });

    it('trim lines exceded "max-log-line-length"', async function() {
        const daemon = await common.daemonWithConfig('stdout.js');
        const client = await common.client(daemon);

        await client.invoke('start', 'trim');
        await client.invoke('wait');
        await client.invoke('stop', 0);
        await client.invoke('wait');

        const logs = (await client.invoke('logs', 'trim'))
            .lines.filter((line) => line.type === 'stdout');

        assert.equal(logs.length, 3, `logged 3 lines`);

        assert.deepEqual(logs.map((line) => line.text),
            ['TWO L', 'AT ON', 'A LIN'],
            `logged everything and in the right order`);

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

        const logs = await client.invoke('logs', appName);

        const logsCondensed = logs.lines.map((line) => {
            return line.type;
        });

        assert.deepEqual(
            logsCondensed.filter((t) => t !== 'stdout'), [
                'moved', 'start', 'moved', 'moved',
                'moved', 'stop', 'exit'
            ], `should have logged '${appName}' lifecycle in the correct order`);

        assert.equal(
            logsCondensed.filter((t) => t === 'stdout').length, 3,
            `should have logged all STDOUT lines of '${appName}'`);
    }

    inAllModes(async function(getDaemon) {
        it('should start/stop apps and their loggers', async function() {
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

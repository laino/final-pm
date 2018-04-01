
const finalPM = require('../../');
const common = require('../common');
const {assert, expect} = require('chai');

describe('daemon', function() {
    it('should start and stop within the test environment', async function() {
        const daemon = await common.daemon();
        await daemon.killDaemon();
    });

    it('should start and stop as a seperate process', async function() {
        const launchConfig = await common.tmplaunchconfig();

        const dprocess = common.trackProcess(await finalPM.daemon.launch(launchConfig));
        const waitExit = common.awaitEvent(dprocess, 'exit');

        const client = await finalPM.client.connect(launchConfig['socket']);

        await client.invoke('killDaemon');

        await client.close();

        await waitExit;
    });

    it('should fail when a daemon is already running', async function() {
        if (common.isWindows()) {
            return;
        }

        const launchConfig = await common.tmplaunchconfig();

        const dprocess = common.trackProcess(await finalPM.daemon.launch(launchConfig));
        const waitExit = common.awaitEvent(dprocess, 'exit');

        await expect(common.trackProcess(finalPM.daemon.launch(launchConfig)))
            .to.be.rejectedWith("Daemon already running");

        const client = await finalPM.client.connect(launchConfig['socket']);

        await client.invoke('killDaemon');

        await client.close();

        await waitExit;
    });

    it('should detect dead unix domain sockets', async function() {
        if (common.isWindows()) {
            return;
        }

        const launchConfig = await common.tmplaunchconfig();

        let dprocess = common.trackProcess(await finalPM.daemon.launch(launchConfig));
        let waitExit = common.awaitEvent(dprocess, 'exit');

        dprocess.kill('SIGKILL');

        await waitExit;

        dprocess = common.trackProcess(await finalPM.daemon.launch(launchConfig));
        waitExit = common.awaitEvent(dprocess, 'exit');

        const client = await finalPM.client.connect(launchConfig['socket']);

        await client.invoke('killDaemon');

        await client.close();

        await waitExit;
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

        assert.isOk(await common.exists(file), "unix socket exists");

        await daemon.close();

        assert.isNotOk(await common.exists(file), "unix socket was removed");

        await daemon.killDaemon();
    });

    it('should reject malformed API calls', async function() {
        const daemon = await common.daemon();
        const client = await common.client(daemon);

        await expect(client.invoke('info', 'derp'))
            .to.be.rejectedWith('Arguments mismatch');

        await expect(client.invoke('start'))
            .to.be.rejectedWith('Arguments mismatch');

        await expect(client.invoke('start', 3))
            .to.be.rejectedWith('Arguments mismatch');

        await expect(client.invoke('404'))
            .to.be.rejectedWith('no such method');

        await expect(client.invoke('all', [{ name: '404', args: [] }]))
            .to.be.rejectedWith('No such API call');

        await expect(client.invoke('all', 'derp'))
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
            assert.isOk(names.has(sample.name), sample.name + " config exists");
            names.delete(sample.name);
        });

        assert.equal(names.size, 0, "no extranous configs exist");

        for (const sample of samples) {
            sample.logger = "404";
            await client.invoke('add', sample);
        }

        info = await client.invoke('info');

        info.applications.filter((app) => !app.builtin).forEach((app, i) => {
            assert.isOk(app['name'] == oldApps[i]['name'],
                `apps are still in the same order`);

            assert.isOk(app.revision > oldApps[i].revision,
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

    it('should report unsuccessful operations as such', async function() {
        const daemon = await common.daemon();
        const client = await common.client(daemon);

        let result = await client.invoke('start', '404');
        assert.isNotOk(result.success, "operation was unsuccessful because the app didn't exist");

        result = await client.invoke('delete', '404');
        assert.isNotOk(result.success, "operation was unsuccessful because the app didn't exist");

        result = await client.invoke('stop', 999);
        assert.isNotOk(result.success, "operation was unsuccessful because the process didn't exist");

        result = await client.invoke('kill', 999);
        assert.isNotOk(result.success, "operation was unsuccessful because the process didn't exist");

        await client.close();
        await daemon.killDaemon();
    });

    async function startStopTestSingleApp(client, appName) {
        const {results} = await client.invoke('all', [
            { name: 'start', args: [appName] },
            { name: 'wait' },
        ]);

        assert.isOk(results[0].success, `${appName} was started successfully`);

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

    inAllModes(function(getDaemon, mode) {
        it('should start/stop apps and their loggers', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            await startStopTestSingleApp(client, 'app');
            await startStopTestSingleApp(client, 'app-listen');
            await startStopTestSingleApp(client, 'app-instant');
            await startStopTestSingleApp(client, 'app-message');

            // FIXME: node bug
            if (mode !== 'fork') {
                await startStopTestSingleApp(client, 'app-disconnect');
            }

            await client.close();
            await daemon.killDaemon();
        });

        it('should restart crashing applications', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            // 1. Start the the app once

            await client.invoke('start', 'app');
            await client.invoke('wait');

            let crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'app',
                'generation': 'running'
            });
            let crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1, "one instance of 'app' is running");

            // 2. Kill the app
            process.kill(crashingApp.pid, 'SIGKILL');

            // 3. Wait for FinalPM to register that it died
            await common.wait(300);

            crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'app',
                'generation': 'new'
            });
            crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1,
                "one instance of 'app' is starting");
            assert.equal(crashingApp.crashes, 1,
                "was restartet once");
            assert.equal(new Date(crashingApp['start-time']).getTime() > Date.now(), 1,
                "is using a start delay");

            // 4. Wait for the startDelay to expire and the app running
            await client.invoke('wait');

            crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'app',
                'generation': 'running'
            });
            crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1,
                "one instance of 'app' is running");

            // 5. Kill it again
            process.kill(crashingApp.pid, 'SIGKILL');

            // 6. Wait for FinalPM to register that
            await common.wait(300);

            crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'app',
                'generation': 'new'
            });
            crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1,
                "one instance of 'app' is starting");
            assert.equal(crashingApp.crashes, 2,
                "was restartet twice");
            assert.equal(new Date(crashingApp['start-time']).getTime() > Date.now(), 1,
                "is using a start delay");

            // 6. This time we stop it before the start delay expires
            await client.invoke('stop', crashingApp.id);
            await client.invoke('wait');

            assert.equal((await client.invoke('info')).processes.length, 0,
                "no processes are running");

            assert.equal(common.matchingObjects((await client.invoke('logs', 'app')).lines, {
                type: 'stop',
                text: 'signal=pre-start'
            }).length, 1, "start delay was aborted");

            await client.close();
            await daemon.killDaemon();
        });

        it('should replace instances 1:1 as new instances become ready', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            const oldestInstance = await client.invoke('start', 'app', {number:0});
            const replacedInstance = await client.invoke('start', 'app', {number:1});
            await client.invoke('start', 'app', {number:2});
            await client.invoke('wait');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app',
                    'generation': 'running'
                }
            ).length, 3, 'three instances should be running');

            await client.invoke('start', 'app', {number: 1});
            await client.invoke('wait');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app',
                    'generation': 'running'
                }
            ).length, 3, 'only three instances should be running');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app',
                    'id': replacedInstance.process.id
                }
            ).length, 0, 'replaced instance should not be running');

            await client.invoke('start', 'app', {number: 4});
            await client.invoke('wait');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app',
                    'generation': 'running'
                }
            ).length, 3, 'still only three instances should be running');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app',
                    'id': oldestInstance.process.id
                }
            ).length, 0, 'oldest instance should not be running');

            await client.close();
            await daemon.killDaemon();
        });

        it('should replace non-unique instances oldest to newest', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            const oldestInstance1 = await client.invoke('start', 'app-uniform');
            const oldestInstance2 = await client.invoke('start', 'app-uniform');

            await client.invoke('start', 'app-uniform');
            await client.invoke('wait');

            await client.invoke('start', 'app-uniform');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app-uniform',
                    'generation': 'running'
                }
            ).length, 3, 'three instances should be running');

            await client.invoke('start', 'app-uniform');
            await client.invoke('wait');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app-uniform',
                    'generation': 'running'
                }
            ).length, 3, 'only three instances should be running');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app-uniform',
                    'id': oldestInstance1.process.id
                }
            ).length, 0, 'oldest instance should not be running');

            await client.invoke('start', 'app-uniform');
            await client.invoke('wait');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app-uniform',
                    'generation': 'running'
                }
            ).length, 3, 'only three instances should be running');

            assert.equal(common.matchingObjects(
                (await client.invoke('info')).processes, {
                    'app-name': 'app-uniform',
                    'id': oldestInstance2.process.id
                }
            ).length, 0, 'second oldest instance should not be running');

            await client.close();
            await daemon.killDaemon();
        });

        it('should kill processes when start-timeout is exceeded', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            await client.invoke('start', 'neverStartsFast');
            await common.wait(400);

            const crashingApps = common.matchingObjects((await client.invoke('info')).processes, {
                'app-name': 'neverStartsFast',
            });
            const crashingApp = crashingApps[0];

            assert.equal(crashingApps.length, 1,
                "one instance of 'neverStartsFast' is running");

            assert.equal(crashingApp.crashes > 0, 1,
                "was restartet at least once");

            assert.equal(new Date(crashingApp['start-time']).getTime() > Date.now(), 1,
                "is using a start delay");

            await client.close();
            await daemon.killDaemon();
        });

        it('should kill processes when stop-timeout is exceeded', async function() {
            const daemon = await getDaemon();
            const client = await common.client(daemon);

            const started = await client.invoke('start', 'neverStopsFast');

            await client.invoke('wait');
            await client.invoke('stop', started.process.id);

            await common.wait(500);

            assert.equal((await client.invoke('info')).processes.length, 0, "nothing is running");

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

    it('should discard old log lines in RAM', async function() {
        const daemon = await common.daemonWithConfig('stdout.js');
        const client = await common.client(daemon);

        await client.invoke('start', 'spammy');
        await client.invoke('wait');
        await common.wait(200);

        const logs = (await client.invoke('logs', 'spammy', {
            lines: 1000
        })).lines.filter((line) => line.type === 'stdout');

        assert.isAtMost(logs.length, 2,
            `two or less log line should fit into RAM`);

        await client.close();
        await daemon.killDaemon();
    });

    it('should discard logs after some time', async function() {
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

    it('should correctly log multiple lines received at once or apart', async function() {
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

    it('should trim lines exceeding "max-log-line-length"', async function() {
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
});

function inAllModes(fn) {
    context('in cluster mode', function() {
        fn.call(this, () => {
            return common.daemonWithConfig();
        }, 'cluster');
    });

    context('in fork mode', function() {
        fn.call(this, () => {
            return common.daemonWithConfig('working-fork.js');
        }, 'fork');
    });
}

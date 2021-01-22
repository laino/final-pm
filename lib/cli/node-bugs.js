
const semver = require('semver');
const finalPM = require('semver');
const cli = require('./');

const BUGS = [
    {
        type: 'daemon',
        nodeVersion: '<9.5.0',
        critical: false,
        description: "Relative unix socket paths are not correctly handled when the daemon's\n" +
                     "working directory differs from the child process.",
        link: "https://github.com/nodejs/node/pull/16749",
    },
    {
        type: 'daemon',
        version: '*',
        critical: true,
        description: "'close' event not emitted when calling process.disconnect() from a parent process.\n" +
                     "Final-PM won't be able to know when your application has stopped.",
        link: "https://github.com/nodejs/node/issues/19433",
        test(info, args, config) {
            for (const app of config.applications) {
                if (app['mode'] === 'fork' && app['stop-signal'] === 'disconnect') {
                    return true;
                }
            }

            return false;
        }
    }
];

function formatBug(bug) {
    return `{bold Version:} ${bug.version}\n` +
           `{bold Type:} ${bug.type}\n` +
           `{bold Ref:} {underline ${bug.link}}\n${bug.description}`;

}

exports.check = (info, args, config, options) => {
    for (const bug of BUGS) {
        let version = finalPM.version;
        let nodeVersion = process.version;

        let matches = false;
        let testMatches = false;

        if (bug.type === 'daemon') {
            version = info.version;
            nodeVersion = info.nodeVersion || process.version;
        }

        if (bug.version && version && semver.satisfies(version, bug.version)) {
            matches = true;
        }

        if (bug.nodeVersion && nodeVersion && semver.satisfies(nodeVersion, bug.nodeVersion)) {
            matches = true;
        }

        if (!matches) {
            continue;
        }

        testMatches = !bug.test || bug.test(info, args, config, options);

        if (!testMatches) {
            cli.debug('BUG', formatBug(bug));
            continue;
        }

        if (bug.critical) {
            cli.err('BUG', formatBug(bug));
            process.exit(1);
        }

        cli.warn('BUG', formatBug(bug));
    }
};

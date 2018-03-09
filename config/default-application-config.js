// default-application-config.js
const os = require("os");
module.exports = {

    /*
     * Name of this application. Used when referring to
     * this application via the command line.
     */

    'name': 'default',

    /*
     * Whether this is an 'application' or a 'logger'.
     */

    'type': 'application',

    /*
     * Whether this applicaton should be started using node.js' cluster
     * mode or as a standalone node process.
     *
     * 'cluster': Use node.js' cluster mode
     * 'fork':    Use child_process.fork()
     */
    'mode': 'cluster',

    /*
     * Defaults to configuration file directory if 'null'.
     * Other paths are relative to this.
     */

    'base-path': null,

    /*
     * Working directory for this application.
     * Relative to base-path.
     */

    'cwd': './',

    /*
     * Entry point of this application.
     * Relative to base-path.
     */

    'run': './server.js',

    /*
     * Array of arguments to pass to the application.
     */

    'args': [],

    /*
     * Array of arguments to pass to node.js when
     * starting a new process of this application.
     *
     * Example: ['--harmony']
     */

    'node-args': [],

    /*
     * Environment variables to pass to the application.
     *
     * By default this contains environment variables with
     * which the config was parsed.
     *
     * Since configuration is parsed with the appropriate
     * npm_package_config_* environment variables of the
     * node package the configuration file resides in,
     * there is no need for weird hacks such as running
     * final-pm through npm.
     */

    'env': process.env,

    /*
     * Defines when FinalPM should consider a process to
     * be ready and thus move it to the 'running' generation.
     *
     * Valid values are 'listen', 'message', 'instant'.
     *
     * 'listen': FinalPM waits for the cluster 'listen'
     *           event, which is emitted when the application
     *           begins to listen on a socket.
     *           Only available in cluster mode.
     *
     * 'message': FinalPM will ignore the cluster 'listen'
     *            event and instead wait for the process to
     *            send a 'ready' message with IPC,
     *            i.e. process.send('ready')
     *
     * 'instant': Process is immediately considered ready.
     */

    'ready-on': 'listen',

    /*
     * Defines how FinalPM should ask a process to stop gracefully.
     *
     * Valid values are 'SIGINT', 'SIGTERM' and 'disconnect'.
     *
     * 'SIGINT': FinalPM will send the SIGINT signal.
     * 'SIGTERM': FinalPM will send the SIGTERM signal.
     * 'disconnect': FinalPM will use child.disconnect()
     * 'message': FinalPM will send a 'stop' message.
     */

    'stop-signal': os.platform() === "win32" ? "message" : "SIGINT",

    /*
     * Defines how FinalPM should kill a process.
     *
     * Process which have been sent the kill signal, but which
     * haven't terminated yet, are considered "Zombie" processes.
     *
     * Valid values are 'SIGTERM' and 'SIGKILL'.
     *
     * 'SIGTERM': FinalPM will send the SIGTERM signal.
     * 'SIGKILL': FinalPM will send the SIGKILL signal.
     */

    'kill-signal': 'SIGKILL',

    /*
     * How many instances / processes FinalPM will
     * launch for this application.
     */

    'instances': 1,

    /*
     * How many instances of this application should at most
     * be allowed to run at the same time. At least 'instances' + 1.
     *
     * If this limit is reached, FinalPM will delay starting
     * new processes until an old one has stopped. This
     * can thus be used to implement staggered restarts.
     *
     * '0' for no limit.
     */

    'max-instances': 0,

    /*
     * Whether FinalPM should consider each process
     * of this application to be functionally identical.
     *
     * 'false': FinalPM will assume instances of this
     *          application are fundamentally the same,
     *          and always replace the oldest processes currently
     *          in the running generation when deciding which
     *          processes to stop when new ones were started.
     *
     * 'true':  FinalPM will add FINAL_PM_INSTANCE_NUMBER=N
     *          to the environment of each process, as well as
     *          always replace processes of this application with
     *          ones having the same FINAL_PM_INSTANCE_NUMBER.
     *          This is useful, for example, if you want to perform
     *          certain jobs only on specific instances of
     *          this application.
     */

    'unique-instances': true,

    /*
     * When true, a new process will be started whenever a
     * running one of this application exited abnormally.
     */

    'restart-crashing': true,

    /*
     * Same as above, except for processes which haven't yet
     * indicated they are ready.
     */

    'restart-new-crashing': true,

    /*
     * Time to wait before starting a new process after one crashed.
     */

    'restart-crashing-delay': 1000,

    /*
     * Logger application to use.
     *
     * 'file-logger' is a simple logger shipping with FinalPM.
     *
     * Refer to final-pm --help-all for how to implement your own logger.
     */

    'logger': 'file-logger',

    /*
     * Arguments to pass to the logger process.
     */

    'logger-args': ['log.txt'],

    /*
     * How many past log bytes to buffer in RAM. Mainly used
     * to show past log lines when using 'final-pm log', but
     * also when a logger isn't yet ready (or crashed and
     * has to be restarted).
     *
     * This value is per-application.
     */

    'max-buffered-log-bytes': 1024 * 1024,

    /*
     * Buffer at most this many bytes per log line, before
     * truncating any additional characters.
     */

    'max-log-line-length': 1024 * 5,

    /*
     * How much time in milliseconds a process has to terminate
     * after being sent SIGINT.
     *
     * If a timeout occurs the process is terminated with SIGKILL.
     *
     * 'null' for no timeout (wait forever).
     */

    'stop-timeout': null,

    /*
     * How much time in milliseconds a process has to become ready.
     *
     * If a timeout occurs the process is terminated with SIGKILL
     * and assumed to have crashed.
     *
     * 'null' for no timeout (wait forever).
     */

    'start-timeout': null

};

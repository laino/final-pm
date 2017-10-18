// default-application-config.js
module.exports = {

    /*
     * Name of this application. Used when referring to
     * this application via the command line.
     */

    'name': 'default',

    /*
     * Entry point of this application.
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
     * Additional environment variables to pass
     * to the application.
     */

    'env': {},

    /* 
     * Working directory for this application.
     */

    'cwd': './',

    /*
     * Defines when FinalPM should consider this
     * application to be ready and thus move it
     * to the 'running' generation.
     *
     * Valid values are 'listen' and 'message'.
     *
     * 'listen': FinalPM waits for the cluster 'listen'
     *           event, which is emitted when the application
     *           begins to listen on a socket.
     *
     * 'message': FinalPM will ignore the cluster 'listen'
     *            event and instead wait for the process to
     *            send a 'ready' message with IPC,
     *            i.e. process.send('ready')
     */

    'ready-on': 'listen',

    /*
     * How many instances / processes FinalPM will
     * launch for this application.
     */

    'instances': 1,

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

    'restart-crashing-timeout': 1000,

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

    'max-buffered-log-bytes': 1000000,

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

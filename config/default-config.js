// default-config.js
const os = require("os");
const path = require("path");
module.exports = {

    /*
     * FinalPM will store state and other information here.
     * Relative to process.cwd(), but absolute paths are also
     * allowed. All other paths in this configuration file are
     * relative to this.
     */

    "home": ".final-pm",

    /*
     * Unix domain socket or host:port combination. FinalPM
     * will use this socket to communicate with the daemon
     * via JSON-RPC 2.0. URLs must start with either "unix://",
     * followed by a relative or absolute paths, or with either
     * "tcp://" or "http://", followed by a host:port comibination.
     *
     * Examples:
     * 
     *     tcp://localhost:32423
     *     unix:///home/user/final-pm.sock # absolute path
     *     unix://home/user/final-pm.sock # Same as above
     *     unix://./final-pm.sock # relative to "home"
     */

    "socket": "unix://./daemon.sock",

    /*
     * Where npm stores its global configuration. 
     * Used to generate config environment variables
     * when running .js configuration files.
     */

    "npm-global-config": "/etc/npmrc",

    /*
     * Where npm stores its per-user configuration. 
     * Used to generate config environment variables
     * when running .js configuration files.
     */

    "npm-user-config": path.resolve(os.homedir(), ".npmrc"),

    /*
     * Array of application configurations.
     * Refer to default-application-config.js
     */

    "applications": [],

}

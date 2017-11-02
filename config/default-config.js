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

    "home": path.resolve(os.homedir(), ".final-pm"),

    /*
     * Unix domain socket or host:port combination. FinalPM
     * will use this socket to communicate with the daemon
     * via JSON-RPC 2.0. URLs must start with either "ws+unix://",
     * followed by a relative or absolute paths, or with "ws://",
     * followed by a host:port combination. If the given
     * host is localhost or an unix domain socket was given,
     * a new daemon will automatically be launched if the
     * connection fails.
     *
     * Examples:
     * 
     *     ws://localhost:3242                # localhost port 3242
     *     ws+unix://./final-pm.sock          # Relative to "home"
     *     ws+unix:///home/user/final-pm.sock # Absolute path
     *     ws+unix://home/user/final-pm.sock  # Absolute path
     */

    "socket": "ws+unix://./daemon.sock",

    /*
     * The daemon's stdout and stderr will be redirected here.
     */

    "daemon-log": "./daemon.out",

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
     * A list of environment variables that shouldn't be passed
     * to config scripts. Avoids marking a configuration as outdated
     * just because some inconsequential environment variable changed.
     */
    
    "ignore-env": [
        "PWD", "OLDPWD", "_", "WINDOWPATH", "WINDOWID", "DESKTOP_STARTUP_ID",
        "XDG_VTNR", "XDG_SESSION_ID", "XDG_SEAT", "XDG_RUNTIME_DIR", "TERM",
        "SHELL", "SSH_CLIENT", "SSH_TTY", "SSH_CONNECTION", "USER", "LANG",
        "LOGNAME", "SHLVL", "MAIL", "HOME", "PS1", "PS2", "PS3", "PS4",
        "PROMPT_COMMAND", "XAUTHORITY", "COLORFGBG", "GITAWAREPROMPT",
        "LC_MESSAGES", "DISPLAY", "EDITOR", "COLORTERM",
        "DBUS_SESSION_BUS_ADDRESS"
    ],

    /*
     * Array of application configurations.
     * Refer to default-application-config.js
     */

    "applications": [],

};

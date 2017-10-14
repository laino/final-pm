
const fs = require('fs');
const path = require('path');

exports.options = [
    { 
        name: 'actionIdGroups',
        value: String,
    },
    {
        name: 'select',
        alias: 's',
        typeLabel: '[underline]{Selector}',
        description: "Select processes/applications (see: [bold]{Selectors})"
    },
    { 
        name: 'action',
        alias: 'a',
        typeLabel: '[underline]{Action}',
        value: String,
        multiple: true,
        description: "Start/Stop/Restart/... all selected (see: [bold]{Actions})"
    },
    { 
        name: 'config',
        alias: 'c',
        typeLabel: '[underline]{Config File}',
        type: String,
        description: "Default: ./process-config.{js,json}\n" +
                     "Load a configuration file into the daemon. For paths beginning with ./ " +
                     "checks parent folders until a package.json is encountered. If you specified a " +
                     "config for an already running application, it will be only be applied to new processes."
    },
    { 
        name: 'set',
        typeLabel: '[underline]{app}-[underline]{key}=[underline]{value}',
        multiple: true,
        type: String,
        description: "Override a configuration key."
    },
    { 
        name: 'help',
        alias: 'h',
        type: Boolean,
        description: "Print this usage guide."
    }
];

exports.usage = [
    {
        header: "FinalPM",
        content: [
            "[italic]{Finally a good process manager.}",
            "",
            "By default all actions are [bold]{graceful}. Old processes will always be cleanly stopped only " +
            "once new processes have indicated they are [bold]{ready}.",
            "",
            "[underline]{Examples}",
            "",
            "# Start processes of all configured applications.",
            "final-pm start all",
            "",
            "# For each running process, start a new one",
            "final-pm restart all",   
            "",
            "# Stop all processes gracefully",
            "final-pm stop all",   
            "",
            "# Stop processes by PID",
            "final-pm stop pid=43342,pid=3452",
            "",
            "# Stop processes by application name 'worker'",
            "final-pm stop worker",
        ],
    },
    {
        header: "Arguments",
        optionList: exports.options,
        hide: "actionIdGroups"
    },
    {
        header: "Actions",
        content: [
            "Valid actions are [bold]{start}, [bold]{stop}, [bold]{restart}, [bold]{kill}, [bold]{scale}.",
            "All arguments not prefixed with '--' are treated as [italic]{Action Selector} pairs.",
            "",
            "[underline]{start}",
            "Start N=[italic]{instances} processes for all selected applications. " + 
            "When processes are selected this will start one new process for each selected one instead. " +
            "May cause existing processes to be gracefully stopped when the newly started ones are ready, and " +
            "will even implicitly stop more processes than were started when [italic]{instances} was decreased " +
            "in the configuration. Note that this may replace different processes than the selected ones, or none at all, " +
            "if [italic]{unique-instances} is set to [italic]{false}. In which case the oldest ones of that application " +
            "will be replaced if [italic]{instances} was exceeded.",
            "",
            "[underline]{restart}",
            "Same as [bold]{start} except [italic]{unique-instances} is ignored and processes are always replaced, " +
            "also stopping processes in case N currently exceeds [italic]{instances}.",
            "",
            "[underline]{stop}",
            "Gracefully stop all selected [italic]{running}/[italic]{new} processes or applications.",
            "",
            "[underline]{kill}",
            "Immediately [bold]{SIGKILL} all selected processes or applications. This works on processes in any [bold]{generation}.",
            "",
            "[underline]{scale}",
            "Starts or stops processes for each selected application until N matches configured [italic]{instances}."
        ]
    },
    {
        header: "Selectors",
        content: [
            "A Process/Application or comma-separated list of such.",
            "",
            "A selector can either be an [italic]{application name} or PID (pid=[italic]{id}). " +
            "Using [bold]{all} as a selector will target all applications found in the configuration and/or are running, " +
            "depending on the action. " +
            "Prefix with [bold]{new:}, [bold]{running:}, [bold]{old:}, or [bold]{marked:} to only target processes in that [bold]{generation}."
        ]
    },
    {
        header: "Generations",
        content: [
            "Processes are grouped in generations:",
            "The [bold]{new}, [bold]{running}, [bold]{old}, and [bold]{marked generation}.",
            "",
            "[underline]{New Generation}",
            "The [bold]{new generation} is where processes remain until they are considered [bold]{ready}. " +
            "A process is considered to be [bold]{ready} on the cluster [bold]{listen} event " +
            "or when it sends the [bold]{ready} message, depending on the configuration (config: [bold]{ready-on}). " +
            "Once a process is [bold]{ready} it is moved to the [bold]{running generation}. " +
            "If a process is asked to be stopped while in the new generation, it is moved to the [bold]{marked generation} instead. " +
            "If a process exits abnormally while in the new generation, a new one is started (config: [bold]{restart-new-crashing}).",
            "",
            "[underline]{Running Generation}",
            "The [bold]{running generation} is where processes remain until they are [bold]{stopped}. At most the configured amount of " +
            "processes for each application may reside here. If [italic]{unique-instances} is set to [italic]{false} and the maximum " +
            "[italic]{instances} was exceeded because new processes were started, the oldest processes will be moved to the [bold]{old generation}. " +
            "If [italic]{unique-instances} is set to [italic]{true}, each process will replace its counterpart 1:1 instead, and only then " +
            "additional processes stopped if [italic]{instances} is exceeded. If a process exits abnormally while in the running generation, " +
            "a new one is started (config: [bold]{restart-crashing}). Note that an older process can never replace a process that was started " +
            "later, ensuring always the latest processes are running even if startup time wildly varies.",
            "",
            "[underline]{Old Generation}",
            "The [bold]{old generation} is where processes remain when they should be [bold]{stopped} until they finally [bold]{exit}. " +
            "A process moved to the [bold]{old generation} is sent the [bold]{SIGINT} signal. If the process does not exit within " +
            "[bold]{stop-timeout} (default is no timeout), it is sent [bold]{SIGKILL} and removed from the old generation.",
            "",
            "[underline]{Marked Generation}",
            "New processes who were asked to stop are kept here, then are moved to the [bold]{old generation} " +
            "once they are [bold]{ready}. This means the programmer never has to worry about handling " +
            "[bold]{SIGINT} signals during startup."
        ]
    },
    {
        header: "Configuration",
        content: [
            "Configuration may be done in either JSON or JS, as well as environment variables and command line arguments. " +
            "Each configuration key can by overriden with an environment variable by replacing all dashes in the key " +
            "with underscores and translating it to uppercase, finally prefixed with FINAL_PM_CONFIG_ i.e. " +
            "restart-new-crashing=true becomes FINAL_PM_CONFIG_RESTART_NEW_CRASHING=true.",
            "",
            "[underline]{Configuration Files}",
            "JS files will be [bold]{require}d with the appropriate [italic]{NPM_PACKAGE_CONFIG_*} environment variables. " +
            "JSON files on the other hand are parsed as-is.",
            "",
            "[underline]{Logging}",
            "Logging is done by a logging process started for each application, which will be fed logging output via process.send(logLine). " +
            "The logging process is automatically started with your application, and is stopped once the last process of your application exits. " +
            "By default all applications use the simple file-logger that ships with final-pm, but creating your own logger is as simple as " +
            "creating a new application 'my-logger' which listens to process.on(...) and setting [italic]{logger} to 'my-logger' in your main application. " +
            "Each logger is fed back its own output, so make sure you don't accidentially call [italic]{console.log} for each log line you receive. "
        ]
    },
    {
        content: {
            options: {
                noTrim: true
            },
            data: [
                { col: "[underline]{Example Config}" },
                { col: "[italic]{final-pm start myApp}\n" }
            ].concat(fileToColumns('examples/sample-config.js'))
        }
    },
    {
        content: {
            options: {
                noTrim: true
            },
            data: [
                { col: "[underline]{Example App}\n" }
            ].concat(fileToColumns('examples/sample-app.js'))
        }
    }
];

function fileToColumns(file) {
    return fs.readFileSync(path.resolve(__dirname, file))
        .toString().split('\n').map(col => {return {col}});
}

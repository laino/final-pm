### FinalPM  

_Finally a good process manager._  

By default all actions are **graceful**. Old processes will always be cleanly stopped only once new processes have indicated they are **ready**.  

__Examples__  

```
  # Start processes of all configured applications.                                                                                        
  final-pm start all                                                                                                                       

  # Override configuration settings and start 4 instances of 'worker'                                                                      
  final-pm --set worker:instances=4 start worker                                                                                           

  # Stop processes by PID                                                                                                                  
  final-pm stop pid=43342 pid=3452                                                                                                         

  # Stop processes by application name 'worker'                                                                                            
  final-pm stop worker                                                                                                                     

  # Stop the first and second currently running worker                                                                                     
  final-pm stop running:worker/0 running:worker/1                                                                                          

```
### Options  

```
  # final-pm [--config File|Folder] [Action Select...] 

  -c, --config File|Folder   Default: process-config.{js,json}                                 
                             Load a configuration file. If the path doesn't begin with ./ or   
                             /, also checks parent folders. If you specified a configuration   
                             for an already running application, it will only be applied once  
                             the application is manually (re-)started, but not when a new      
                             process is spawned after a crash.                                 
  --set [app:]key=value      Override a configuration key.                                     
  -n, --lines num            When using the log action, sets the number of past log lines to   
                             display. Up to max-buffered-log-bytes (see --help-configuration). 
  -f, --follow               When using the log action, will output new log lines continously  
                             as they appear. Cancel with CTRL-C.                               
  --launch                   Start the daemon even if there's nothing to do.                   
  --kill                     Stop the daemon, ungracefully killing any remaining processes.    
                             This is done after all other commands have been sent to the       
                             daemon.                                                           
                             Use 'final-pm --wait --kill stop all' to achieve a graceful stop. 
  --wait                     Wait for any pending actions to complete. This means final-pm     
                             will only return once the queue, new, old and marked generations  
                             are empty.                                                        
  --force                    Make final-pm ignore some safeguards. (I hope you know what       
                             you're doing)                                                     
  --no-upload                Don't upload new application configurations from config files.    
  --dry                      Don't actually do anything, use --verbose for more output.        
  -v, --verbose              Show debug output.                                                
  --help                     Print short usage guide.                                          
  --help-usage               Print full usage guide including actions.                         
  --help-generations         Print help page about generations.                                
  --help-example             Print a short example application.                                
  --help-configuration       Print full configuration help.                                    
  --help-all                 Print full help page.                                             

```

**Selectors**  

A selector identifies a process or an application.  

A selector can either be an _application name_, internal process ID (id=_id_), or OS process ID (pid=_pid_). Using **all** as a selector will target all applications found in the configuration or which are running, depending on the action. An application name followed by /_N_ (slash _N_) will only select the _N_-th process of that application. Prefix your selector with **new:**, **running:**, **old:**, or **marked:** to only target processes in that **generation**. See the usage examples above.  

**Actions**  

Valid actions are **start**, **stop**, **kill**, **scale**, **show**, **add**, **delete**, **log**.  

__start / restart__  

Upload configuration (implies **add**), then start N=_instances_ processes for all selected applications. When processes are selected this will start one new process for each selected one instead. May cause existing processes to be gracefully stopped when the newly started ones are ready, and will even implicitly stop more processes than were started when _instances_ was decreased in the configuration. Note that this may replace different processes than the selected ones, or none at all, if _unique-instances_ is set to _false_. In which case the oldest ones of that application will be replaced if _instances_ was exceeded.  

__stop__  

Gracefully stop all selected _running/new_ processes or applications.  

__kill__  

Immediately **SIGKILL** all selected processes or applications. This works on processes in any **generation**.  

__scale__  

Upload configuration (implies **add**), then start or stop processes for each selected application until the number of running processes matches configured _instances_.  

__show__  

Show information about all selected applications / processes. To also show logging processes, use **--verbose**.  

__add__  

Upload application configurations to the daemon, replacing older instances of the same configuration.  

__delete__  

Delete application configurations from the daemon.  

__log__  

Show process output. Understands **--follow** and **--lines**, which work the same as the UNIX _tail_ command.  

### Generations  

Processes are grouped in generations:  
The **queue**, **new**, **running**, **old**, and **marked generation**.  

__Queue Generation__  

All processes begin in this generation and remain here until they can be started. Usually they can be started immediately unless **max-instances** is reached.  

__New Generation__  

The **new generation** is where processes remain until they are considered **ready**. A process is considered to be **ready** on the cluster **listen** event or when it sends the **ready** message, depending on the configuration (config: **ready-on**). Once a process is **ready** it is moved to the **running generation**. If a process is asked to be stopped while in the new generation, it is moved to the **marked generation** instead. If a process exits abnormally while in the new generation, a new one is started (config: **restart-new-crashing**).  

__Running Generation__  

The **running generation** is where processes remain until they are **stopped**. At most the configured amount of processes for each application may reside here. If _unique-instances_ is set to _false_ and the maximum _instances_ was exceeded because new processes were started, the oldest processes will be moved to the **old generation**. If _unique-instances_ is set to _true_, each process will replace its counterpart 1:1 instead, and only then will additional processes be stopped if _instances_ is exceeded. If a process exits abnormally while in the running generation, a new one is started (config: **restart-crashing**). Note that an older process can never replace a process that was started later, ensuring always the latest processes are running even if startup time wildly varies.  

__Old Generation__  

The **old generation** is where processes remain when they should be **stopped** until they finally **exit**. A process moved to the **old generation** is sent the **SIGINT** signal. If the process does not exit within **stop-timeout** (default is no timeout), it is sent **SIGKILL** and removed from the old generation.  

__Marked Generation__  

New processes who were asked to stop are kept here, then are moved to the **old generation** once they are **ready**. This means the programmer never has to worry about handling **SIGINT** signals during startup.  

### Configuration  

Configuration may be done in either JSON or JS, as well as environment variables and command line arguments. On the command line configuration keys may be overriden with **--set** _key_=_value_, where _key_ may be any configuration key. To override keys within an appliaction config, prefix _key_ with '_application-name_:' like so: --set myApp:ready-on="message"  

Each configuration key can also be overriden with an environment variable by replacing all dashes and colons in _key_ with underscores and translating it to uppercase, finally prefixed with FINAL_PM_CONFIG_,  
i.e. myApp:ready-on="message" becomes FINAL_PM_CONFIG_MYAPP_READY_ON=message.  

__Logging__  

Logging is done by a logging process started for each application, which will be fed logging output via process.send(logLine). Logger processes are started with the same CWD as your application. Keep this in mind when passing relative paths to loggers. The logging process is automatically started with your application, and is stopped once the last process of your application exits. By default all applications use the simple file-logger that ships with final-pm, but creating a custom logger is very simple. Have a look at the file-logger if you're curious how to create your own logger:  
https://github.com/laino/final-pm/blob/master/loggers/file.js  
All output of logger processes themselves will end up in the daemon log file (_daemon-log_).  

__Default Config__  

```js
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
       * will use this socket to communicate with the daemon.                                   
       * URLs must start with either "ws+unix://", followed by                                  
       * either a relative or absolute path, or with "ws://",                                   
       * followed by a host:port combination. If the given host is                              
       * localhost or an unix domain socket was given, a new daemon                             
       * will automatically be launched if the connection fails.                                
       *                                                                                        
       * Examples:                                                                              
       *                                                                                        
       *     ws://localhost:3242                # localhost port 3242                           
       *     ws+unix://./final-pm.sock          # Relative to "home"                            
       *     ws+unix:///home/user/final-pm.sock # Absolute path                                 
       *     ws+unix://home/user/final-pm.sock  # Absolute path                                 
       */                                                                                       

      "socket": os.platform() === "win32" ? "ws://localhost:34253" : "ws+unix://./daemon.sock", 

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

```

__Default Application Config__  

```js
  // default-application-config.js                                          
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
       */                                                                   

      'stop-signal': 'SIGINT',                                              

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
       * be allowed to run at the same time. At least 'instances' + 1\.      
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

```

### Example  

__Example Config__  

_final-pm --config sample-config.js start myApp_  

```js
  // sample-config.js                                                  
  module.exports = {                                                   
      'applications': [{                                               
          'name': 'myApp',                                             
          'run': './sample-app.js',                                    
          'args': ['arg1', 'arg2'],                                    
          'node-args': ['--harmony'],                                  
          'ready-on': 'message',                                       
          'instances': process.env['npm_package_config_workers'] || 4, 
      }]                                                               
  };                                                                   

```

__Example App__  

```js
  // sample-app.js                                                        
  const cluster = require('cluster');                                     
  require('http').createServer((req, res) => {                            
      res.end(process.argv.join(' ')); // Reply with process arguments    
  }).listen(3334, (error) => {                                            
      if (error) {                                                        
          throw error;                                                    
      }                                                                   
      console.log("Process started, telling master we are ready...");     
      process.send('ready');                                              
  });                                                                     
  process.on('SIGINT', () => {                                            
      console.log("SIGINT received. Performing clean shutdown...");       
      // Implicitly calls server.close, then disconnects the IPC channel: 
      cluster.worker.disconnect();                                        
  });                                                                     

```
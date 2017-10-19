### FinalPM  

_Finally a good process manager._  

By default all actions are **graceful**. Old processes will always be cleanly  
stopped only once new processes have indicated they are **ready**.  

__Examples__  

<pre>  # Start processes of all configured applications.                             
  final-pm start all                                                            

  # For each running process, start a new one                                   
  final-pm restart all                                                          

  # Stop all processes gracefully                                               
  final-pm stop all                                                             

  # Stop processes by PID                                                       
  final-pm stop pid=43342 pid=3452                                              

  # Stop processes by application name 'worker'                                 
  final-pm stop worker                                                          

</pre>

### Options  

<pre>  # final-pm [--config File|Folder] [--set app-key=value] [Action Select...] 

  -v, --verbose              Show debug output.                                                            
  --launch                   Start the daemon even if there's nothing to do.                               
  --kill                     Stop the daemon, killing any remaining processes.                             
                             This is done after all actions have been applied.                             
  -c, --config File|Folder   Default: process-config.{js,json}                                             
                             Load a configuration file. If path doesn't begin with ./ or /, also checks    
                             parent folders. If you specified a configuration for an already running       
                             application, it will be only be applied to new processes.                     
  --set app-key=value        Override a configuration key.                                                 
  -n, --lines num            When using the log action, sets the number of past log lines to display. Up   
                             to max-buffered-log-bytes.                                                    
  -f, --follow               When using the log action, will output new log lines continously as they      
                             appear.                                                                       
  -h, --help                 Print short usage guide.                                                      
  --help-usage               Print slightly more verbose usage guide.                                      
  --help-generations         Print help page about generations.                                            
  --help-example             Print a short example application.                                            
  --help-configuration       Print full configuration help.                                                
  --help-all                 Print full help page.                                                         

</pre>

**Selectors**  

A selector identifies a process or an application.  

A selector can either be an _application name_ or PID (pid=_id_). Using **all** as a  
selector will target all applications found in the configuration or which are  
running, depending on the action. Prefix with **new:**, **running:**, **old:**, or  
**marked:** to only target processes in that **generation**.  

**Actions**  

Valid actions are **start**, **stop**, **restart**, **kill**, **scale**, **show**, **log**.  

__start__  

Start N=_instances_ processes for all selected applications. When processes are  
selected this will start one new process for each selected one instead. May  
cause existing processes to be gracefully stopped when the newly started ones  
are ready, and will even implicitly stop more processes than were started  
when _instances_ was decreased in the configuration. Note that this may replace  
different processes than the selected ones, or none at all, if _unique-  
instances_ is set to _false_. In which case the oldest ones of that application  
will be replaced if _instances_ was exceeded.  

__restart__  

Same as **start** except _unique-instances_ is ignored and processes are always  
replaced, also stopping processes in case N currently exceeds _instances_.  

__stop__  

Gracefully stop all selected _running_/_new_ processes or applications.  

__kill__  

Immediately **SIGKILL** all selected processes or applications. This works on  
processes in any **generation**.  

__scale__  

Starts or stops processes for each selected application until N matches  
configured _instances_.  

__show__  

Show information about all selected applications / processes.  

__log__  

Show process output. Understands **--follow** and **--lines**, which work the same as  
the UNIX _tail_ command.  

### Generations  

Processes are grouped in generations:  
The **new**, **running**, **old**, and **marked generation**.  

__New Generation__  

The **new generation** is where processes remain until they are considered **ready**.  
A process is considered to be **ready** on the cluster **listen** event or when it  
sends the **ready** message, depending on the configuration (config: **ready-on**).  
Once a process is **ready** it is moved to the **running generation**. If a process  
is asked to be stopped while in the new generation, it is moved to the **marked  
generation** instead. If a process exits abnormally while in the new  
generation, a new one is started (config: **restart-new-crashing**).  

__Running Generation__  

The **running generation** is where processes remain until they are **stopped**. At  
most the configured amount of processes for each application may reside here.  
If _unique-instances_ is set to _false_ and the maximum _instances_ was exceeded  
because new processes were started, the oldest processes will be moved to the  
**old generation**. If _unique-instances_ is set to _true_, each process will  
replace its counterpart 1:1 instead, and only then additional processes  
stopped if _instances_ is exceeded. If a process exits abnormally while in the  
running generation, a new one is started (config: **restart-crashing**). Note  
that an older process can never replace a process that was started later,  
ensuring always the latest processes are running even if startup time wildly  
varies.  

__Old Generation__  

The **old generation** is where processes remain when they should be **stopped**  
until they finally **exit**. A process moved to the **old generation** is sent the  
**SIGINT** signal. If the process does not exit within **stop-timeout** (default is  
no timeout), it is sent **SIGKILL** and removed from the old generation.  

__Marked Generation__  

New processes who were asked to stop are kept here, then are moved to the **old  
generation** once they are **ready**. This means the programmer never has to worry  
about handling **SIGINT** signals during startup.  

### Configuration  

Configuration may be done in either JSON or JS, as well as environment  
variables and command line arguments. On the command line configuration keys  
may be overriden with **--set** _key_=_value_, where _key_ may be any configuration  
key. To override keys within an appliaction config, prefix _key_ with  
'_application-name_:' like so: --set myApp:ready-on="message"  

Each configuration key can also be overriden with an environment variable by  
replacing all dashes and colons in _key_ with underscores and translating it to  
uppercase, finally prefixed with FINAL_PM_CONFIG_,  
i.e. myApp:ready-on="message" becomes FINAL_PM_CONFIG_MYAPP_READY_ON=message.  

__Logging__  

Logging is done by a logging process started for each application, which will  
be fed logging output via process.send(logLine). The logging process is  
automatically started with your application, and is stopped once the last  
process of your application exits. By default all applications use the simple  
file-logger that ships with final-pm, but creating your own logger is as  
simple as creating a new application 'my-logger' which listens to  
process.on(...) and setting _logger_ to 'my-logger' in your main application.  
Each logger is fed back its own output, so make sure you don't accidentally  
call _console.log_ for each log line you receive.  

__Default Config__  

<pre>  // default-config.js                                                
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
       * via JSON-RPC 2.0\. URLs must start with either "ws+unix://",  
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
       * Array of application configurations.                         
       * Refer to default-application-config.js                       
       */                                                             

      "applications": [],                                             

  }                                                                   

</pre>

__Default Application Config__  

<pre>  // default-application-config.js                                          
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

</pre>

### Example  

__Example Config__  

_final-pm --config sample-config.js start myApp_  

<pre>  // sample-config.js                                                  
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

</pre>

__Example App__  

<pre>  // sample-app.js                                                     
  const server = require('http').createServer((req, res) => {          
      res.end(process.argv.join(' ')); // Reply with process arguments 
  }).listen(3333, (error) => {                                         
      if (error) {                                                     
          throw error;                                                 
      }                                                                
      console.log("Process started, telling master we are ready...");  
      process.send('ready');                                           
  });                                                                  
  process.on('SIGINT', () => {                                         
      console.log("SIGINT received. Performing clean shutdown...");    
      server.close();                                                  
  });                                                                  

</pre>
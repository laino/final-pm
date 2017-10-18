### FinalPM  

_Finally a good process manager._  

By default all actions are **graceful**. Old processes will always be cleanly  
stopped only once new processes have indicated they are **ready**.  

__Examples__  

<pre>  # Start processes of all configured applications.                             
  final-pm start all                                                            
</pre>

<pre>  # For each running process, start a new one                                   
  final-pm restart all                                                          
</pre>

<pre>  # Stop all processes gracefully                                               
  final-pm stop all                                                             
</pre>

<pre>  # Stop processes by PID                                                       
  final-pm stop pid=43342 pid=3452                                              
</pre>

<pre>  # Stop processes by application name 'worker'                                 
  final-pm stop worker                                                          
</pre>

### Options  

<pre>  # final-pm [--config File|Folder] [--set app-key=value] [Action Select...] 
</pre>

<pre>  -c, --config File|Folder   Default: process-config.{js,json}                                             
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
variables and command line arguments. Each configuration key can by overriden  
with an environment variable by replacing all dashes in the key with  
underscores and translating it to uppercase, finally prefixed with  
FINAL_PM_CONFIG_ i.e. restart-new-crashing=true becomes  
FINAL_PM_CONFIG_RESTART_NEW_CRASHING=true.  

__Configuration Files__  

JS files will be **require()**'d with the appropriate _npm\_package\_config\_*_  
environment variables. JSON files on the other hand are parsed as-is. JS files
may return a promise, where they need to perform some asynchronous work.

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
  module.exports = {                                                  
</pre>

<pre>      /*                                                              
       * FinalPM will store state and other information here.         
       * Relative to process.cwd(), but absolute paths are also       
       * allowed. All other paths in this configuration file are      
       * relative to this.                                            
       */                                                             
</pre>

<pre>      "home": ".final-pm",                                            
</pre>

<pre>      /*                                                              
       * Unix domain socket or host:port combination. FinalPM         
       * will use this socket to communicate with the daemon          
       * via JSON-RPC 2.0\. URLs must start with either "unix://",     
       * followed by a relative or absolute paths, or with either     
       * "tcp://" or "http://", followed by a host:port comibination. 
       *                                                              
       * Examples:                                                    
       *                                                              
       *     tcp://localhost:32423                                    
       *     unix:///home/user/final-pm.sock # absolute path          
       *     unix://home/user/final-pm.sock # Same as above           
       *     unix://./final-pm.sock # relative to 'home'              
       */                                                             
</pre>

<pre>      "socket": "unix://./daemon.sock",                               
</pre>

<pre>      /*                                                              
       * Array of application configurations.                         
       * Refer to default-application-config.js                       
       */                                                             
</pre>

<pre>      "applications": []                                              
</pre>

<pre>  }                                                                   
</pre>

__Default Application Config__  

<pre>  // default-application-config.js                                          
  module.exports = {                                                        
</pre>

<pre>      /*                                                                    
       * Name of this application. Used when referring to                   
       * this application via the command line.                             
       */                                                                   
</pre>

<pre>      'name': 'default',                                                    
</pre>

<pre>      /*                                                                    
       * Entry point of this application.                                   
       */                                                                   
</pre>

<pre>      'run': './server.js',                                                 
</pre>

<pre>      /*                                                                    
       * Array of arguments to pass to the application.                     
       */                                                                   
</pre>

<pre>      'args': [],                                                           
</pre>

<pre>      /*                                                                    
       * Array of arguments to pass to node.js when                         
       * starting a new process of this application.                        
       *                                                                    
       * Example: ['--harmony']                                             
       */                                                                   
</pre>

<pre>      'node-args': [],                                                      
</pre>

<pre>      /*                                                                    
       * Additional environment variables to pass                           
       * to the application.                                                
       */                                                                   
</pre>

<pre>      'env': {},                                                            
</pre>

<pre>      /*                                                                    
       * Working directory for this application.                            
       */                                                                   
</pre>

<pre>      'cwd': './',                                                          
</pre>

<pre>      /*                                                                    
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
</pre>

<pre>      'ready-on': 'listen',                                                 
</pre>

<pre>      /*                                                                    
       * How many instances / processes FinalPM will                        
       * launch for this application.                                       
       */                                                                   
</pre>

<pre>      'instances': 1,                                                       
</pre>

<pre>      /*                                                                    
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
       *          to the environment of each process, as well               
       *          always replace processes of this application with         
       *          ones having the same FINAL_PM_INSTANCE_NUMBER.            
       *          This is useful, for example, if you want to perform       
       *          certain jobs only on specific instances of                
       *          this application.                                         
       */                                                                   
</pre>

<pre>      'unique-instances': true,                                             
</pre>

<pre>      /*                                                                    
       * When true, a new process will be started whenever a                
       * running one of this application exited abnormally.                 
       */                                                                   
</pre>

<pre>      'restart-crashing': true,                                             
</pre>

<pre>      /*                                                                    
       * Same as above, except for processes which haven't yet              
       * indicated they are ready.                                          
       */                                                                   
</pre>

<pre>      'restart-new-crashing': true,                                         
</pre>

<pre>      /*                                                                    
       * Time to wait before starting a new process after one crashed.      
       */                                                                   
</pre>

<pre>      'restart-crashing-timeout': 1000,                                     
</pre>

<pre>      /*                                                                    
       * Logger application to use.                                         
       *                                                                    
       * 'file-logger' is a simple logger shipping with FinalPM.            
       *                                                                    
       * Refer to final-pm --help-all for how to implement your own logger. 
       */                                                                   
</pre>

<pre>      'logger': 'file-logger',                                              
</pre>

<pre>      /*                                                                    
       * Arguments to pass to the logger process.                           
       */                                                                   
</pre>

<pre>      'logger-args:': ['log.txt'],                                          
</pre>

<pre>      /*                                                                    
       * How many past log bytes to buffer in RAM. Mainly used              
       * to show past log lines when using 'final-pm log', but              
       * also when a logger isn't yet ready (or crashed and                 
       * has to be restarted).                                              
       *                                                                    
       * This value is per-application.                                     
       */                                                                   
</pre>

<pre>      'max-buffered-log-bytes': 1000000,                                    
</pre>

<pre>      /*                                                                    
       * How much time in milliseconds a process has to terminate           
       * after being sent SIGINT.                                           
       *                                                                    
       * If a timeout occurs the process is terminated with SIGKILL.        
       *                                                                    
       * 'null' for no timeout.                                             
       */                                                                   
</pre>

<pre>      'stop-timeout': null,                                                 
</pre>

<pre>      /*                                                                    
       * How much time in milliseconds a process has to become ready.       
       *                                                                    
       * If a timeout occurs the process is terminated with SIGKILL         
       * and assumed to have crashed.                                       
       *                                                                    
       * 'null' for no timeout.                                             
       */                                                                   
</pre>

<pre>      'start-timeout': null                                                 
</pre>

<pre>  };                                                                        
</pre>

### Example  

__Example Config__  

_final-pm --config sample-config.js start myApp_  

<pre>  // sample-config.js                                                  
  module.exports = {                                                   
      'applications': [                                                
          'name': 'myApp',                                             
          'run': './sample-app.js',                                    
          'args': ['arg1', 'arg2'],                                    
          'node-args': ['--harmony'],                                  
          'ready-on': 'message',                                       
          'instances': process.env['NPM_PACKAGE_CONFIG_WORKERS'] || 4, 
      ]                                                                
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

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

<pre>  # final-pm [--config Config File] [--set app-key=value] [Action Selectors...] 
</pre>

<pre>  -h, --help                 Print this usage guide.                                                       
  -c, --config Config File   Default: ./process-config.{js,json}                                           
                             Load a configuration file into the daemon. For paths beginning with ./ checks 
                             parent folders until a package.json is encountered. If you specified a        
                             config for an already running application, it will be only be applied to new  
                             processes.                                                                    
  --set app-key=value        Override a configuration key.                                                 
  -n, --lines num            When using the log action, sets the number of past log lines to display. Up   
                             to max-buffered-log-lines.                                                    
  -f, --follow               When using the log action, will output new log lines continously as they      
                             appear.                                                                       
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

JS files will be **require()**'d with the appropriate _NPM_PACKAGE_CONFIG_*_  
environment variables. JSON files on the other hand are parsed as-is.  

__Logging__  

Logging is done by a logging process started for each application, which will  
be fed logging output via process.send(logLine). The logging process is  
automatically started with your application, and is stopped once the last  
process of your application exits. By default all applications use the simple  
file-logger that ships with final-pm, but creating your own logger is as  
simple as creating a new application 'my-logger' which listens to  
process.on(...) and setting _logger_ to 'my-logger' in your main application.  
Each logger is fed back its own output, so make sure you don't accidentially  
call _console.log_ for each log line you receive.  

__Example Config__  

_final-pm start myApp_  

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
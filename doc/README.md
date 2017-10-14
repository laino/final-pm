__**FinalPM**__  

_Finally a good process manager._  

By default all actions are **graceful**. Old processes will always be cleanly  
stopped only once new processes have indicated they are **ready**.  

__Examples__  

<pre>  # Start processes of all configured applications. This                        
  # may cause existing processes to be gracefully stopped once                  
  # they are ready, making this similar to 'restart'.                           
  $ final-pm start all                                                          
</pre>

<pre>  # For each running process, start a new one                                   
  $ final-pm restart all                                                        
</pre>

<pre>  # Stop all processes gracefully                                               
  $ final-pm stop all                                                           
</pre>

<pre>  # Stop processes by PID                                                       
  $ final-pm stop pid=43342,pid=3452                                            
</pre>

<pre>  # Stop processes by application name 'worker'                                 
  $ final-pm stop worker                                                        
</pre>

__**Arguments**__  

<pre>  -s, --select Selector                  Select processes/applications.                                                
  -a, --action start|stop|restart|kill   Start/Stop/Restart/Kill all selected.                                         
  -c, --config Config File               Default: ./process-config.{js,json} and checks parent folders until a         
                                         package.json is encountered. If you specified a config for an already running 
                                         application, it will be only be applied to new processes.                     
  --set app-key=value                    Override a configuration key.                                                 
  -h, --help                             Print this usage guide.                                                       
</pre>

__**Selectors**__  

A Process/Application or comma-separated list of such.  

A selector can either be an _application name_ or PID (pid=_id_). Using **all** as a  
selector will target all applications found in the configuration and/or are  
running, depending on the action. Prefix with **new:**, **running:**, **old:**, or  
**marked:** to only target processes in that **generation**.  

__**Generations**__  

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
If the maximum was exceeded because new processes were started, the oldest  
processes will be moved to the **old generation**. If a process exits abnormally  
while in the running generation, a new one is started (config: **restart-  
crashing**).  

__Old Generation__  

The **old generation** is where processes remain when they should be **stopped**  
until they finally **exit**. A process moved to the **old generation** is sent the  
**SIGINT** signal. If the process does not exit within **stop-timeout** (default is  
no timeout), it is sent **SIGKILL** and removed from the old generation.  

__Marked Generation__  

New processes who were asked to stop are kept here, then are moved to the **old  
generation** once they are **ready**. This means the programmer never has to worry  
about handling **SIGINT** signals during startup.  

__**Configuration**__  

Configuration may be done in either JSON or JS, as well as environment  
variables and command line arguments. Each configuration key can by overriden  
with an environment variable by replacing all dashes in the key with  
underscores and translating it to uppercase, finally prefixed with  
FINAL_PM_CONFIG_ i.e. restart-new-crashing=true becomes  
FINAL_PM_CONFIG_RESTART_NEW_CRASHING=true.  

__Configuration Files__  

JS files will be **require**d with the appropriate _NPM_PACKAGE_CONFIG_*_  
environment variables. JSON files on the other hand are parsed as-is.  

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
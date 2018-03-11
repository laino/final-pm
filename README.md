FinalPM
=======

[![Build Status](https://travis-ci.org/laino/final-pm.svg?branch=master)](https://travis-ci.org/laino/final-pm)
[![Coverage Status](https://coveralls.io/repos/github/laino/final-pm/badge.svg?branch=master)](https://coveralls.io/github/laino/final-pm?branch=master)
[![David](https://img.shields.io/david/laino/final-pm.svg)](https://david-dm.org/laino/final-pm)
[![GitHub package version](https://img.shields.io/github/package-json/v/laino/final-pm.svg)](https://github.com/laino/final-pm)
[![npm](https://img.shields.io/npm/v/final-pm.svg)](https://www.npmjs.com/package/final-pm)

Finally a solid process manager. Never unintentionally kill your application in production again.

Why?
----

The current state of node.js process managers is terrible. Besides most of them
trying to be 20 things at once, and not even being decent at any of them, 
there is hardly one being half as reliable as you'd expect of a core component.

Features
--------

- Easy [configuration](https://github.com/laino/final-pm/blob/master/config/default-application-config.js) in either JSON or JS
- Graceful restarting of applications by default
- Clean process lifecycle management without the 
  possibility of edge cases or race conditions
- Simple and Safe

Design Philosophy
-----------------

Most of the complicated logic resides outside of the daemon itself, either sandboxed
into other processes (Loggers) or moved up the chain (clients). The daemon should only support
a minimal set of generic functions, which can be used to create higher level interfaces,
such as the CLI.

Process state is managed in [generations](https://github.com/laino/final-pm/tree/master/doc#generations),
which are exclusively managed by synchronous code, asynchronous operations such as timeouts being hidden
by the Process object and their state robustly managed there. This avoids weird or buggy behavior due to
multiple asynchronous operations creating race conditions, from which many process managers suffer.

Taken together these design decisions should create an extremely robust daemon process on which
your application can rely. A crashing daemon process means crashing applications - A component
meant to make your application more reliable should avoid introducing additional points of failure.

Quick Start
-----------

Install FinalPM with your preferred node package manager and make sure it is working:

```bash
yarn global add final-pm
final-pm --help
```

Create a bare-bones configuration `process-config.json`:
```json
{
    "applications": [{
        "name": "myApp",
        "run": "app.js"
    }]
}
```

And a simple application `app.js`:
```js
require('http').createServer((req, res) => {
    console.log(req.url);
    res.end("Hello World!");
}).listen(5555);

// If the master asks us to stop, do so
process.on('SIGINT', () => {
    console.log("Goodbye World!");

    // Implicitly calls server.close, then disconnects the IPC channel:
    require('cluster').worker.disconnect();
});
```

Once you have done so, in the same directory, run `final-pm start myApp`:
```
[...]
[INFO ] [Action] Start 1 process...
[INFO ] [Action] Success
```

If you navigate to [http://localhost:5555/](http://localhost:5555/) now, you should
be greeted with "Hello World!".

You can watch your app's console output with `final-pm log -f` or check the `log.txt`
file created in the same directory:
```
[...]
[LOG  ] [10:24:36 AM] [myApp/0] [STDOUT] /
[LOG  ] [10:24:36 AM] [myApp/0] [STDOUT] /favicon.ico
```

Now, because we are expecting a heavy load on our application, we may be inclined to
start multiple instances of it. For this we will modify `process-config.json`
to look like this:

```json
{
    "applications": [{
        "name": "myApp",
        "run": "app.js",
        "instances": 4
    }]
}
```

Use `final-pm scale myApp` to make FinalPM automatically figure out how many new processes to start:
```
[INFO ] [Config] myApp{instances} updated
[INFO ] [Action] Start 3 processes...
[INFO ] [Action] Success
```

`final-pm show` will show an overview of all currently running processes. There you may notice that
one of our processes (myApp/0) has a little indicator saying "(old)" behind its name. This means
that the process was started using an older configuration (before we added instances: 4).

In our case this is not important, since the new configuration doesn't affect the behavior of our processes
at all. But let's just replace it with a new process to get rid of that pesky "(old)":

`final-pm restart myApp/0`

```
[INFO ] [Action] Start 1 process...
[INFO ] [Action] Success
```

What this will do is start a new process for `myApp/0`, then stop the old process once the new instance has
become ready. Zero Downtime. Also `restart` is really just an alias for `start`, since FinalPM always
stops old processes once new instances of them become ready. Instead of `scale myApp` we also could
have just used `restart myApp` from the get-go, arriving at same final result of 4 processes without any
old configurations.

We have hardly scratched the surface of what FinalPM can do, though this is the end of this quick start guide.
For further reading check `final-pm --help-usage`, `final-pm --help-configuration`, `final-pm --help-generations` etc.

To stop the daemon and kill all remaining processes, do:

`final-pm --kill`

[(CLI) Documentation](https://github.com/laino/final-pm/blob/master/doc/README.md)
-------------

Documentation for the CLI/architecture can be found [here](https://github.com/laino/final-pm/blob/master/doc/README.md).
The same information is also accessible via `final-pm --help-all`.

Also check out the [/examples](https://github.com/laino/final-pm/blob/master/examples/) directory.
If you have cloned this repository locally, the easiest way to start playing around with them is
`cd examples && final-pm start all`.

TODO
----

- More test cases, especially for negatives
- Documentation for using FinalPM programmatically / Daemon API
- Support arbitrary processes (non-node)

Comparison Between Process Managers
-------------------------------------------

| Feature | FinalPM | PM2 |
| --- | --- | --- |
| Basic Process Management (start / stop / kill) | __Yes__ | __Yes__ |
| Graceful Starts/Restarts/Stops | __Yes__ | __Possibly__ (1)
| FSM-Style Process Lifecycles | __Yes__ | __No__ (2) |
| Safe by Design | __Yes__ | __No__ (3) |
| Helpful and Early Errors | __Always__ (4) | __Sometimes__ |
| Clean Configuration | __Yes__ | __No__ (5) |
| Lines of Code | ~__3,000__ | ~__20,000__ |
| Metrics and a boatload of other features | __No__ | __Yes__ (6) |

1. PM2 may default to ungracefully restarting/stopping applications if some conditions are not met, for instance:
   your application isn't considered online yet, you want to use the ``ready`` message, or you're using
   the ``fork`` mode. FinalPM on the other hand will always complete a clean lifecycle for each started process.
2. PM2 handles process state transitions by means of imperative, callback based code, making it hard to reason about
   the effects of multiple concurrent actions. FinalPM separates command/signal handlers for each process state
   and models state transition in an atomic fashion, thus eliminating edge cases.
3. In many cases PM2 will naively perform dangerous actions which may result in downtime.
4. FinalPM is very strict in what it will accept, aborting with helpful error messages if anything with your configuration or
   command looks fishy. FinalPM will never try to *assume* anything about what you meant to do, and not default to any 
   potentially harmful action. We believe not accidentally killing your production application is preferable to ease of use.
5. FinalPM treats all configuration keys the same. Each key can be provided by either a configuration file, an environment
   variable or a program argument. PM2 tends to have different names for the same configuration keys across environment variables
   and configuration files, and some closely related keys are even spread out across multiple places.
6. We don't believe any of these belong directly in a process manager, but FinalPM won't stand in your way of
   adding such things to your application. Due to only focusing on the basics, FinalPM's codebase is smaller
   by an order of magnitude.

FinalPM
=======

Finally a solid process manager that just works.

Getting started
--------------------

The project is currently in the works, but you can already check out some

[Documentation](https://github.com/laino/final-pm/blob/master/doc/README.md)

[and Examples](https://github.com/laino/final-pm/blob/master/examples/)

Why?
----

The current state of node.js process managers is terrible. Besides most of them
trying to be 20 things at once, and not even being decent at any of them, 
there is hardly one being half as reliable or complete in important features
as you'd expect of a core component.

Design Philosophy
-----------------

Most of the complicated logic resides outside of the daemon itself, either sandboxed
into other processes (Loggers) or moved up the chain (clients). The daemon should only support
a minimal set of generic functions, which can be used to create higher level interfaces,
such as the CLI.

Process state is managed in [https://github.com/laino/final-pm/tree/master/doc#generations](generations),
which are exclusively managed by synchronous code, asynchronous operations such as timeouts being hidden
by the Process object and their state robustly managed there. This avoids weird or buggy behavior due to
multiple asynchronous operations creating race conditions, from which many process managers suffer.

Taken together these design decisions should create an extremely robust daemon process on which
your application can rely. A crashing daemon process means crashing applications - A component
meant to make your application more reliable should avoid introducing additional points of failure.

A note on PM2
------------
_This section is mostly a rant I wrote after losing a night's worth of sleep when I made the
mistake of trying to switch to pm2 in production._

PM2 is the most popular, and as anyone unfortunate enough to have to read
its source code will quickly discover, also a mess of spaghetti code, inconsistencies
and plain weirdness. The aforementioned pitiful souls being basically everyone with
a valid use case for a process manager, who had to resort to reading source code
because of lacking documentation or undocumented behavior.

Want to set up graceful reloads for your web app, so your user's downloads
don't get interrupted when you deploy? Not happy with the default behavior
of PM2 considering your process online when it starts to listen on a socket?
Good luck.

Because the documentation won't help you and instead will confuse you even further
by being outdated, wrong, or having 2 chapters on what is apparently the same thing,
except with a completely different description.

Good luck figuring out how to configure the thing, because only half the config
can be done in ecosystem.config.js / environment variables each, even for things closely related
to each other. For those still searching, here's the config values for graceful reloads:

```
# ecosystem.apps || ENV

kill_timeout     || PM2_KILL_TIMEOUT                # How long PM2 waits after SIGINT before sending SIGKILL
listen_timeout   || PM2_GRACEFUL_LISTEN_TIMEOUT     # How long PM2 waits for the 'listening' event or 'ready' message before considering your process online anyways (WHY?)
(NONE)           || PM2_GRACEFUL_TIMEOUT            # How long PM2 waits after sending 'shutdown' (graceful reload) before shutting down your process normally

# DANGER ZONE: SETTING THESE TO 'true' OR 'fork' (default) respectively will silently cause PM2 to un-gracefully restart your application [1]:
wait_ready       || (NONE)                          # true or false, If true, PM2 will wait for process.send('ready') instead of waiting for the 'listening' event.
exec_mode        || (NONE)                          # 'fork' or 'cluster'. 
```
1: [Comment](https://github.com/Unitech/pm2/commit/a53fd17a7015cf77dd9a04a01300c60a98c0fc08#commitcomment-24954769)

Don't trust a process manager that can't get basic stuff like that right, will send you down a goose
chase with a completely wrong error message and a lack of documentation, then will reveal to you
that no, you can't have graceful reloads with process.send('ready') actually.



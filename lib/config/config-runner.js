"use strict";

let resultSent = false;

async function load(module) {
    // 1. Require the config module.
    // The module may export a Promise-like.
    let result = await require(module);

    // 2. if the module exports a single function, call it.
    // The exported function may return a Promise-like
    if (typeof result === "function") {
        // Some people might think they can export classes and get a cool
        // |this| to play with.
        // We say "nope" (at least for modules/functions in strict mode)!
        result = await result.call(Object.freeze(Object.create(null)));
    }

    // 3. Send result.
    process.send({result});
    resultSent = true;
}

function handleError(error) {
    // 1. Convert the error into something we can send.
    error = error || "Unknown Error";
    const stack = error.stack || "";
    const message = error.message || new String(error);

    // 2. Send the error.
    process.send({error: {message, stack}});
    if (!resultSent) {
        process.exitCode = 1;
    }
}

// Install uncaught handlers.
// Should the required config module throw an uncaught exception or have an
// unhandled rejection *before* it produces a result, this will be it.
// Regular exceptions/rejections occuring within the main code path of loading
// the module or executing the exported function (if any) are caught when
// calling our load function.
process.on("uncaughtException", handleError);
process.on("unhandledRejection", handleError);

// Call our async config module loader.
// If anything throws/rejects, handleError will catch it.
load(process.argv[2]).catch(handleError);

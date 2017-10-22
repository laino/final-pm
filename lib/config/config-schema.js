const Joi = require('joi');

module.exports = {
    "config-path": Joi.string().optional(),
    "home": Joi.string(),
    "socket": Joi.string().uri().regex(/^(ws|ws\+unix):\/\//),
    "daemon-log": Joi.string(),
    "socket-path": Joi.string().optional(),
    "socket-port": Joi.string().optional(),
    "socket-host": Joi.string().optional(),
    "is-local": Joi.boolean().optional(),
    "npm-global-config": Joi.string(),
    "npm-user-config": Joi.string(),
    "applications": Joi.array().items(Joi.object().keys({
        "name": Joi.string().regex(/^all$/, {invert: true, name: 'is not "all"'}).regex(/^\w+$/, {name: "is only letters"}),
        "base-path": Joi.alternatives().try(Joi.string(), Joi.valid(null)),
        "run": Joi.string(),
        "args": Joi.array().items(Joi.string()),
        "node-args": Joi.array().items(Joi.string()),
        "env": Joi.object(),
        "cwd": Joi.string(),
        "ready-on": Joi.string().valid("listen", "message"),
        "stop-signal": Joi.string().valid("SIGINT", "SIGTERM", "disconnect"),
        "kill-signal": Joi.string().valid("SIGTERM", "SIGKILL"),
        "instances": Joi.number().integer().positive(),
        "unique-instances": Joi.boolean(),
        "restart-crashing": Joi.boolean(),
        "restart-new-crashing": Joi.boolean(),
        "restart-crashing-delay": Joi.number().integer().positive(),
        "logger": Joi.string(),
        "logger-args": Joi.array().items(Joi.string()),
        "max-buffered-log-bytes": Joi.number().integer().positive(),
        "stop-timeout": Joi.alternatives().try(Joi.number().integer().positive(), Joi.valid(null)),
        "start-timeout": Joi.alternatives().try(Joi.number().integer().positive(), Joi.valid(null)),
        "config-path": Joi.string().optional()
    }))
};

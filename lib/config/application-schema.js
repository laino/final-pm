const Joi = require('joi');

module.exports = Joi.object().keys({
    "config-path": Joi.string().optional(),
    "type": Joi.string().valid("application", "logger"),
    "mode": Joi.string().valid("cluster", "fork"),
    "builtin": Joi.boolean().optional(),
    "name": Joi.string()
        .regex(/^all$/, {invert: true, name: 'is not "all"'})
        .regex(/^[\w_-]+$/, {name: "is valid letters"})
        .regex(/^[^-]/, {name: "dosn't start with '-'"}),
    "base-path": Joi.alternatives().try(Joi.string(), Joi.valid(null)),
    "run": Joi.string(),
    "args": Joi.array().items(Joi.string()),
    "node-args": Joi.array().items(Joi.string()),
    "env": Joi.object(),
    "cwd": Joi.string(),
    "ready-on": Joi.string().valid("listen", "message", "instant"),
    "stop-signal": Joi.string().valid("SIGINT", "SIGTERM", "disconnect", "message"),
    "kill-signal": Joi.string().valid("SIGTERM", "SIGKILL"),
    "instances": Joi.number().integer().positive().max(65536),
    "max-instances": Joi.number().integer().max(65536),
    "unique-instances": Joi.boolean(),
    "restart-crashing": Joi.boolean(),
    "restart-new-crashing": Joi.boolean(),
    "restart-crashing-delay": Joi.number().integer().positive(),
    "logger": Joi.string(),
    "logger-args": Joi.array().items(Joi.string()),
    "max-buffered-log-bytes": Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER),
    "max-log-line-length": Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER),
    "log-retention-timeout": Joi.number().integer(),
    "stop-timeout": Joi.alternatives().try(Joi.number().integer().positive(), Joi.valid(null)),
    "start-timeout": Joi.alternatives().try(Joi.number().integer().positive(), Joi.valid(null))
});

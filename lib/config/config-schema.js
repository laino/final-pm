const Joi = require('joi');

const applicationSchema = require('./application-schema.js');

module.exports = Joi.object().keys({
    "config-path": Joi.alternatives().try(Joi.string(), null).optional(),
    "home": Joi.string(),
    "socket": Joi.string().uri().regex(/^(ws|ws\+unix):\/\//),
    "daemon-log": Joi.string(),
    "socket-path": Joi.string().optional(),
    "socket-port": Joi.string().optional(),
    "socket-host": Joi.string().optional(),
    "is-local": Joi.boolean().optional(),
    "npm-global-config": Joi.string(),
    "npm-user-config": Joi.string(),
    "ignore-env": Joi.array().items(Joi.string()),
    "applications": Joi.array().items(applicationSchema)
});

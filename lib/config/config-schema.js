const Joi = require('joi');

module.exports = {
    "config-path": Joi.string().optional(),
    "home": Joi.string(),
    "socket": Joi.string().uri().regex(/^(tcp|unix):\/\//),
    "socket-path": Joi.string().optional(),
    "socket-port": Joi.string().optional(),
    "socket-host": Joi.string().optional(),
    "npm-global-config": Joi.string(),
    "npm-user-config": Joi.string(),
    "applications": Joi.array()
};

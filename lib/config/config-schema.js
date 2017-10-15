const Joi = require('joi');

module.exports = {
    "config-path": Joi.string().optional(),
    "home": Joi.string(),
    "socket": Joi.string().uri().regex(/^(tcp|unix):\/\//),
    "socket-parth": Joi.string(),
    "applications": Joi.array()
};

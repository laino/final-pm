const Joi = require('joi');

module.exports = {
    "home": Joi.string().description("home folder, internal paths like 'socket' are relative to this."),
    "socket": Joi.string().uri().regex(/^(tcp|unix):\/\//)
              .description("control socket")
              .example("tcp://host:port, unix://relativePath or unix:////absolutePath")
};

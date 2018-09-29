/*
 * This file just contains the public API definition
 * and argument validation, the actual implementation
 * is in ./daemon.js.
 */

const applicationSchema = require('../config').applicationSchema;
const Joi = require('joi');
const util = require('util');
const WebSocket = require('final-rpc').WebSocket;

const apiCallArraySchema = Joi.array().items(Joi.object({
    name: Joi.string(),
    args: Joi.array().optional()
}));

const APIDefinition = {
    add: [
        applicationSchema,
        Joi.object({
            force: Joi.boolean().optional()
        }).optional(),
    ],

    delete: [
        Joi.reach(applicationSchema, 'name').required()
    ],

    start: [
        Joi.reach(applicationSchema, 'name').required(),
        Joi.object({
            number: Joi.number().integer().optional()
        }).optional()
    ],

    stop: [
        Joi.number().integer()
    ],

    kill: [
        Joi.number().integer()
    ],

    send: [
        Joi.number().integer(),
        Joi.any()
    ],

    info: [],

    wait: [
        Joi.boolean().optional()
    ],

    logs: [
        Joi.alternatives().try(
            Joi.reach(applicationSchema, 'name'),
            Joi.valid('all')).required(),
        Joi.object({
            follow: Joi.boolean().optional(),
            lines: Joi.number().integer().optional()
        }).optional()
    ],

    follow: [
        Joi.reach(applicationSchema, 'name').required()
    ],

    unfollow: [
        Joi.reach(applicationSchema, 'name').required()
    ],

    killDaemon: [],

    all(args) {
        const result = apiCallArraySchema.validate(args[0], { presence: 'required' });

        if (result.error) {
            throw new APIError(result.error.message);
        }

        for (const apiCall of args[0]) {
            exports.validate(apiCall.name, apiCall.args || []);
        }
    },
};

class APIError extends Error {
    constructor(message) {
        super(message);
        this.name = 'APIError';
    }
}

exports.APIError = APIError;

exports.from = (that, impl) => {
    const result = {};

    for (const key of Object.keys(APIDefinition)) {
        /* istanbul ignore if */
        if (!(typeof impl[key] === 'function')) {
            // Just makes sure we didn't forget anything in our implementation
            throw new Error(`${key} is not implemented`);
        }

        result[key] = wrapAPICallImplementation(that, key, impl[key]);
    }

    return result;
};

exports.validate = (name, args) => {
    if (!Object.prototype.hasOwnProperty.call(APIDefinition, name)) {
        throw new APIError(`No such API call: ${name}`);
    }

    const definition = APIDefinition[name];

    try {
        runDefinition(definition, args);
    } catch (error) {
        /* istanbul ignore if: programmer error passthrough */
        if (error.name !== 'APIError') {
            throw error;
        }

        throw new APIError(`Arguments mismatch for ${name}: ` + error.message);
    }
};

function runDefinition(definition, args) {
    if (typeof definition === 'function') {
        return definition(args);
    }

    if (definition.isJoi) {
        const result = definition.validate(args, { presence: 'required' });

        if (result.error) {
            throw new APIError(result.error.message);
        }

        return;
    }

    /* istanbul ignore if: checks for programmer error */
    if (!Array.isArray(definition)) {
        throw new APIError(`Unknown definition: ${util.inspect(definition)}`);
    }

    /* istanbul ignore if: hard to test */
    if (!(args instanceof Array)) {
        throw new APIError(`Expected an array, but got ${typeof args}`);
    }

    if (args.length > definition.length) {
        throw new APIError(
            `Takes at most ${definition.length} arguments, but got ${args.length}`);
    }

    for (var i = 0; i < definition.length; i++) {
        runDefinition(definition[i], args[i]);
    }
}

function wrapAPICallImplementation(that, key, fn) {
    return (...args) => {
        let validateArgs = args;

        // Last argument may be the client, don't run
        // it through the validate function
        if (args[args.length -1] instanceof WebSocket) {
            validateArgs = validateArgs.slice(0, -1);
        }

        exports.validate(key, validateArgs);

        return fn.apply(that, args);
    };
}

/*
 * This file just contains the public API definition
 * and argument validation, the actual implementation
 * is in ./daemon.js.
 */

const applicationSchema = require('../config').applicationSchema;
const Joi = require('joi');
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
        }),
    ],

    delete: [
        Joi.reach(applicationSchema, 'name')
    ],

    start: [
        Joi.reach(applicationSchema, 'name'),
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

    info: [],

    wait: [],

    logs: [
        Joi.reach(applicationSchema, 'name'),
        Joi.object({
            follow: Joi.boolean().optional(),
            lines: Joi.number().integer().optional()
        }).optional()
    ],

    killDaemon: [],

    all(args) {
        apiCallArraySchema.validate(args[0], { presence: 'required' });

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
        if (!(typeof impl[key] === 'function')) {
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
        if (error.name === 'ValidationError' || error.name === 'APIError') {
            throw new APIError(`Arguments mismatch for ${name}: ` + error.message);
        }

        throw error;
    }
};

function runDefinition(definition, args) {
    if (typeof definition === 'function') {
        return definition(args);
    }

    if (definition instanceof Array) {
        if (!(args instanceof Array)) {
            throw new APIError(`Takes an array, but got ${typeof args}`);
        }

        if (args.length > definition.length) {
            throw new APIError(
                `Takes at most ${definition.length} arguments, but got ${args.length}`);
        }

        for (var i = 0; i < definition.length; i++) {
            runDefinition(definition[i], args[i]);
        }

        return;
    }

    definition.validate(args, { presence: 'required' });
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

        return validateResult(fn.apply(that, args));
    };
}

function validateResult(result, asyncResult) {
    if (typeof result !== 'object') {
        throw new Error(
            "Result must be an object, was: " + JSON.stringify(result));
    }

    if (typeof result.then === 'function' && !asyncResult) {
        return new Promise((resolve, reject) => {
            result.then((result) => {
                try {
                    resolve(validateResult(result), true);
                } catch (error) {
                    reject(error);
                }
            }, reject);
        });
    }

    if (typeof result.success !== 'boolean') {
        throw new Error(
            "Result has no 'success' property: " + JSON.stringify(result));
    }

    return result;
}

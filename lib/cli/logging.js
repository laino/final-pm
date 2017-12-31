"use strict";
/* eslint-disable no-console */

const stripAnsi = require('strip-ansi');
const ansi = require('ansi-escape-sequences');

exports.verbose = false;

exports.debug = function(...out) {
    if (!exports.verbose) return;

    console.log(makeLogLine(
        ['[gray]{DEBUG}'].concat(out),
        process.stdout
    ));
};

exports.log = function(...args) {
    console.log(makeLogLine(
        ['[white]{INFO }'].concat(args),
        process.stdout
    ));
};

exports.appLog = function(data) {
    const color = {
        stderr: 'red',
        stdout: 'white'
    }[data.type] || 'gray';

    console.log(makeLogLine([
        `[gray]{LOG  }`,
        formatDate(data.timestamp),
        data.app + '/' + data.process.number,
        `[${color}]{${data.type.toUpperCase()}}`,
        data.text
    ], process.stdout));
};

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = Date.now();

    if (now - timestamp > 24 * 60 * 60 * 1000) {
        return date.toLocaleString();
    }

    return date.toLocaleTimeString();
}

exports.err = function(...args) {
    console.error(makeLogLine(
        ['[red]{ERROR}'].concat(args),
        process.stderr
    ));
};

exports.warn = function(...args) {
    console.error(makeLogLine(
        ['[yellow]{WARN }'].concat(args),
        process.stderr
    ));
};


exports.reply = function(...args) {
    console.log(makeLogLine(
        ['[green]{REPLY}'].concat(args),
        process.stdout
    ));
};

function makeLogLine(args, out) {
    const last = args[args.length - 1];
    const pre = `[[bold]{${args.slice(0, args.length - 1).join('}] [[bold]{')}}] `;

    const lines = last.split('\n');
    const result = ansi.format(lines.map(line => pre + line).join('\n'));

    if (out.isTTY) {
        return result;
    }

    return stripAnsi(result);
}


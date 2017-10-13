#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const argsDefinition = require('../cli-args.js');
const commandLineUsage = require('command-line-usage');
const AnsiToHtml = new (require('ansi-to-html'))({
    standalone: true, bg: "#FAFAFA",
    fg: "#222222",
    newline: true
});

fs.writeFileSync(path.resolve(__dirname, 'README.html'),
    '<html><body style="margin: 2em; font-size: 15px"><pre>' +
    AnsiToHtml.toHtml(commandLineUsage(argsDefinition.usage)) +
    '</pre></body></html>'
);


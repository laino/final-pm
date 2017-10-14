#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const argsDefinition = require('../cli-args.js');
const commandLineUsage = require('command-line-usage');
const toMarkdown = require('to-markdown');
const AnsiToHtml = new (require('ansi-to-html'))({
    standalone: true, bg: "#FAFAFA",
    fg: "#222222",
    newline: true
});

const htmlBody = AnsiToHtml.toHtml(commandLineUsage(argsDefinition.usage));
const html = `<html><body style="margin: 2em; font-size: 15px"><pre>${htmlBody}</pre></body></html>`;
const markdown = toMarkdown(htmlBody);

fs.writeFileSync(path.resolve(__dirname, 'README.html'), html);
fs.writeFileSync(path.resolve(__dirname, 'README.md'), markdown);

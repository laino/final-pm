#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const argsDefinition = require('../cli-args.js');
const commandLineUsage = require('command-line-usage');
const toMarkdown = require('to-markdown');
const AnsiToHtml = new (require('ansi-to-html'))({
    standalone: true,
    bg: "#FAFAFA",
    fg: "#222222",
    newline: false
});

let inBlock = false;

const htmlBody = '<p>' + AnsiToHtml.toHtml(commandLineUsage(argsDefinition.helpAll))
    .split('\n').map(line => {

        const lineIsEmpty = line.trim() === '';
        const length = line.trim().length;
        const withoutTags = line.replace(/<(.*?)>/g, '');
        const lineIsBlock = !lineIsEmpty && (
            /^ *[-#$/{};]/.test(withoutTags) || /^ {4}/.test(withoutTags) || inBlock);

        line = line.replace(/[#] /g, '&#35; ');

        if (lineIsEmpty) {
            line = '</p>\n\n<p>';
        }
        
        if (!lineIsBlock && !lineIsEmpty) {
            line = line.trim() + '<br>'; 
            if (length < 70 && line.startsWith('<')) {
                line = line + '\n<br>';
            }
        }

        if (lineIsBlock !== inBlock) {
            inBlock = lineIsBlock;
            if (lineIsBlock) {
                line = '<pre>' + line;
            } else {
                line = '</pre>' + line;
            }
        }

        if (lineIsBlock) {
            line = line.replace(/<i>(.*?)<\/i>/g, '$1');
            line = line.replace(/<b>(.*?)<\/b>/g, '$1');
            line = line.replace(/<u>(.*?)<\/u>/g, '$1');
        }

        return line + '\n';
    }).join('') + '</p>';

const html = `<html><body style="margin: 2em; font-size: 15px">${htmlBody}</body></html>`;
const markdown = toMarkdown(htmlBody, { 
    converters: [{
        filter: 'u',
        replacement: function(content) {
            return '__' + content + '__';
        }
    }]
}).replace(/__\*\*(\w.*?\w)\*\*__/g, '### $1');

fs.writeFileSync(path.resolve(__dirname, 'README.html'), html);
fs.writeFileSync(path.resolve(__dirname, 'README.md'), markdown);

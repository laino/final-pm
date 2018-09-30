#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const argsDefinition = require('../cli-args.js');
const commandLineUsage = require('command-line-usage');
const turndownService = new (require('turndown'))({
    codeBlockStyle: 'fenced',
    fence: '```'
});

const AnsiToHtml = new (require('ansi-to-html'))({
    standalone: true,
    bg: "#FAFAFA",
    fg: "#222222",
    newline: false
});

let inBlock = false;
let lineWasEmpty = false;

const definition = argsDefinition.all;

process.stdout.columns = 120;

definition.forEach((section) => {
    if (!section.content) {
        return;
    }

    if (section.content instanceof Array) {
        section.content = {
            options: {},
            data: section.content.map((row) => {
                return {
                    col: row
                };
            })
        };
    }

    section.content.options.noWrap = true;
    section.content.options.maxWidth = 120;
});

const htmlBody = '<p>' + AnsiToHtml.toHtml(commandLineUsage(definition))
    .split('\n').map(line => {
        const lineIsEmpty = line.trim() === '';
        const length = line.trim().length;
        const withoutTags = line.replace(/<(.*?)>/g, '');
        const lineIsBlock = !lineIsEmpty && (/^ *[-#$/{};]/.test(withoutTags) || /^ {4}/.test(withoutTags)) ||
                            (inBlock && !lineWasEmpty);

        line = line.replace(/[#] /g, '&#35; ');

        if (lineIsEmpty && !lineIsBlock) {
            line = '</p>\n\n<p>';
        }

        if (!lineIsBlock && !lineIsEmpty) {
            line = line.trim() + '<br>';
            if (length < 70 && line.startsWith('<')) {
                line = line + '\n<br>';
            }
        }

        if (lineIsBlock !== inBlock) {
            if (lineIsBlock) {
                let lang = '';

                if (/\/\/.*\.js *$/.test(line))
                    lang = 'language-javascript';

                line = `<pre><code class="${lang}">` + line;
            } else {
                line = '</code></pre>' + line;
            }
        }

        if (lineIsBlock) {
            line = line.replace(/<i>(.*?)<\/i>/g, '$1');
            line = line.replace(/<b>(.*?)<\/b>/g, '$1');
            line = line.replace(/<u>(.*?)<\/u>/g, '$1');
        }

        lineWasEmpty = lineIsEmpty;
        inBlock = lineIsBlock;

        return line + '\n';
    }).join('') + '</p>';

const html = `<html><body style="margin: 2em; font-size: 15px">${htmlBody}</body></html>`;

turndownService.addRule('u', {
    filter: 'u',
    replacement: function(content) {
        return '__' + content + '__';
    }
});

const markdown = turndownService.turndown(htmlBody).replace(/__\*\*(\w.*?\w)\*\*__/g, '### $1');

fs.writeFileSync(path.resolve(__dirname, 'README.html'), html);
fs.writeFileSync(path.resolve(__dirname, 'README.md'), markdown);

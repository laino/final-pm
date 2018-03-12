process.stdout.write('TWO LINES\r\nAT ONCE\r\n');
process.stdout.write('A LINE IN');
setTimeout(() => {
    process.stderr.write('STDERR\r\n');
    process.stdout.write(' TWO PARTS\r\n');
    process.send('ready');
}, 100);

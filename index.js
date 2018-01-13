
const fs = require('fs');
const path = require('path');
const version = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json')).toString()
).version;

Object.assign(module.exports, {
    daemon: require('./lib/daemon'),
    client: require('./lib/client'),
    config: require('./lib/config'),
    version
});

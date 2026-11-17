const fs = require('fs');
const path = require('path');
const ini = require('ini');

const options = ini.parse(
  fs.readFileSync(path.join(__dirname, '../../config.ini'), 'utf-8')
);
const { port, auth_user, auth_password } = options.http_server;

// HTTPS is opt-in: set both to PEM paths to serve over TLS instead of plain HTTP.
// Same variable names as agr_ui's dev server, so one cert setup serves both.
const HTTPS_KEY = process.env.DEV_HTTPS_KEY || '';
const HTTPS_CERT = process.env.DEV_HTTPS_CERT || '';
if (!HTTPS_KEY !== !HTTPS_CERT) {
  throw new Error('DEV_HTTPS_KEY and DEV_HTTPS_CERT must be set together');
}

const userVars = {
  PORT: parseInt(port),
  USER: auth_user,
  PASSWORD: auth_password,
  HTTPS_KEY,
  HTTPS_CERT
};


let envVars = {
  VERSION: process.env.npm_package_version,
  NODE_ENV: process.env.NODE_ENV
};

for (let key in envVars) {
  let val = envVars[key];

  if (val === '' || val === undefined) {
    delete envVars[key];
  }
}

let conf = Object.assign({}, userVars, envVars);

Object.freeze(conf);

module.exports = conf;
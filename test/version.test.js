// Keeps the public /version.txt and the login-page footer in sync.
//   node test/version.test.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const v = fs.readFileSync(path.join(root, 'version.txt'), 'utf8');
let fail = 0;
function check(name, ok) { console.log((ok ? '  ok   ' : '  FAIL ') + name); if (!ok) fail++; }
check('version.txt is exactly "X.Y.Z\\n" (version only)', /^\d+\.\d+\.\d+\n$/.test(v));
const ver = v.trim();
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
check('login.html footer shows v' + ver, login.includes('id="site-version"') && login.includes('>v' + ver + '<'));
process.exit(fail ? 1 : 0);

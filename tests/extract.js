// Pull a named inline <script id="..."> out of index.html so Node can test it.
const fs = require('fs');
const [, , file, id, out] = process.argv;
const html = fs.readFileSync(file, 'utf8');
const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
if (!m) { console.error('no <script id="' + id + '"> in ' + file); process.exit(1); }
fs.writeFileSync(out, m[1]);

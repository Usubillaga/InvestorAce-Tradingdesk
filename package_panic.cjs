// Bundle the checked-out journals in the uploaded HTML. The desk can open the
// account tab before its larger market snapshot or an external feed arrives.
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const read = name => fs.readFileSync(path.join(dir,name),'utf8');
const records = {
  original:JSON.parse(read('heat-account.json')),
  overlap:JSON.parse(read('heat-overlap.json'))
};
if (records.original.schema !== 1 || records.overlap.schema !== 1 ||
    !records.overlap.books['5'] || !records.overlap.books['6']) throw Error('Missing paper accounts');
const empty = '<script id="desk-panic-seed" type="application/json">{}</script>';
const html = read('index.html');
if (!html.includes(empty)) throw Error('Missing paper journal slot');
const seed = JSON.stringify(records).replace(/</g,'\\u003c');
fs.writeFileSync(path.join(dir,'index.html'),html.replace(empty,() => empty.replace('{}',() => seed)));

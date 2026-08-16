const fs = require('fs');
const code = fs.readFileSync('node_modules/dukascopy-node/dist/index.js', 'utf8');
const marker = 'var instrument_meta_data_default = ';
const start = code.indexOf(marker);
if (start < 0) {
  console.log('no marker');
  process.exit(1);
}

let depth = 0;
let inStr = false;
let strChar = '';
let esc = false;
const objStart = start + marker.length;

for (let i = objStart; i < code.length; i++) {
  const c = code[i];
  if (inStr) {
    if (esc) {
      esc = false;
    } else if (c === '\\') {
      esc = true;
    } else if (c === strChar) {
      inStr = false;
    }
  } else {
    if (c === '"' || c === "'") {
      inStr = true;
      strChar = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        const raw = code.slice(objStart, i);
        fs.writeFileSync('src/lib/instrumentMetaData.json', raw);
        console.log('wrote', i - objStart, 'chars');
        process.exit(0);
      }
    }
  }
}

console.log('unbalanced');

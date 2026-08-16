const { spawn } = require('child_process');
const http = require('http');

const child = spawn('./node_modules/.bin/tsx', ['tests/drawings.foundation.test.ts'], {
  env: { ...process.env, NODE_OPTIONS: '--inspect=9229' }
});

setTimeout(() => {
  console.log("Fetching debugger info...");
  http.get('http://localhost:9229/json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(JSON.parse(data)));
  }).on('error', console.error);
  
  setTimeout(() => child.kill(), 2000);
}, 3000);

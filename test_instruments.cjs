const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/instruments',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json)) {
        console.log('Response is array, count:', json.length);
        console.log('First item keys:', Object.keys(json[0] || {}).join(', '));
        console.log('First item:', JSON.stringify(json[0]));
      } else {
        console.log('Response is object, keys:', Object.keys(json).join(', '));
      }
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Raw:', data.substring(0, 200));
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();

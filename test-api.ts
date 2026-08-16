import fetch from 'node-fetch';

fetch('http://localhost:3000/api/historical-data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    instrument: 'eurusd',
    timeframe: 'm1',
    from: '2024-01-01T00:00:00.000Z',
    to: '2024-01-02T00:00:00.000Z'
  })
}).then(r => r.json()).then(console.log).catch(console.error);

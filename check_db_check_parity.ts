import http from 'http';

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  try {
    const dbCheck = await fetchJson('http://localhost:3000/api/debug/db-check');
    const state = await fetchJson('http://localhost:3000/api/debug/state');
    
    const dbCheckSettings = dbCheck.cache.approvedSettings || [];
    const stateSettings = state.data || [];
    
    const dbCheckSymbols = dbCheckSettings.map((s: any) => s.symbol).sort();
    const stateSymbols = stateSettings.map((s: any) => s.symbol).sort();
    
    console.log("=== PARITY REPORT ===");
    console.log(`db-check Count: ${dbCheckSettings.length}`);
    console.log(`state Count: ${stateSettings.length}`);
    console.log(`db-check Symbols: ${dbCheckSymbols.join(', ')}`);
    console.log(`state Symbols: ${stateSymbols.join(', ')}`);
    
    const diff = dbCheckSymbols.filter((x: string) => !stateSymbols.includes(x)).concat(stateSymbols.filter((x: string) => !dbCheckSymbols.includes(x)));
    console.log(`Diff: ${diff.length === 0 ? 'NONE' : diff.join(', ')}`);
    
  } catch (e) {
    console.error(e);
  }
}
run();

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
    const state = await fetchJson('http://localhost:3000/api/debug/state');
    const dbCheck = await fetchJson('http://localhost:3000/api/debug/db-check');
    
    const shadowSettings = state.data || [];
    const legacySettings = dbCheck.cache.approvedSettings || [];
    
    const shadowSymbols = shadowSettings.map((s: any) => s.symbol).sort();
    const legacySymbols = legacySettings.map((s: any) => s.symbol).sort();
    
    console.log("=== PARITY REPORT ===");
    console.log(`Legacy Count: ${legacySettings.length}`);
    console.log(`Shadow Count: ${shadowSettings.length}`);
    console.log(`Legacy Symbols: ${legacySymbols.join(', ')}`);
    console.log(`Shadow Symbols: ${shadowSymbols.join(', ')}`);
    
    const diff = legacySymbols.filter((x: string) => !shadowSymbols.includes(x)).concat(shadowSymbols.filter((x: string) => !legacySymbols.includes(x)));
    console.log(`Diff: ${diff.length === 0 ? 'NONE' : diff.join(', ')}`);
    
    console.log("\n=== /api/debug/state OUTPUT ===");
    console.log(JSON.stringify(state, null, 2));
  } catch (e) {
    console.error(e);
  }
}
run();

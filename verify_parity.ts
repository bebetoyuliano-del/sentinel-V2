
import fs from 'fs';
import path from 'path';
import { rangeFilterPineExact, OHLCV } from './range_filter_pine';

// Simple CSV parser
function parseCSV(content: string): any[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;
    
    const row: any = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j].trim();
    }
    data.push(row);
  }
  return data;
}

function runVerification() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.log('Usage: npx tsx verify_parity.ts <input_csv_path> [output_csv_path]');
    console.log('Input CSV must have columns: time,open,high,low,close,volume (TradingView export format)');
    return;
  }

  const outputFile = process.argv[3] || 'rf_output.csv';

  try {
    const content = fs.readFileSync(inputFile, 'utf-8');
    const rows = parseCSV(content);
    
    console.log(`Loaded ${rows.length} rows from ${inputFile}`);
    
    // Convert to OHLCV format
    // TradingView export time is usually ISO or unix timestamp?
    // Assuming standard TV export: time (ISO or unix), open, high, low, close, volume
    
    const ohlcv: OHLCV[] = rows.map(r => {
        // Try to parse time
        let time = 0;
        if (r.time) {
            const t = new Date(r.time).getTime();
            if (!isNaN(t)) time = t;
            else time = parseInt(r.time);
        }
        
        return [
            time,
            parseFloat(r.open),
            parseFloat(r.high),
            parseFloat(r.low),
            parseFloat(r.close),
            parseFloat(r.volume || '0')
        ];
    });
    
    // Filter out invalid rows
    const validOhlcv = ohlcv.filter(c => !isNaN(c[1]) && !isNaN(c[4]));
    console.log(`Valid OHLCV bars: ${validOhlcv.length}`);
    
    if (validOhlcv.length < 100) {
        console.error('Not enough data bars.');
        return;
    }

    const params = { src: 'close' as const, per: 100, mult: 3.0 };
    console.log('Running Range Filter with params:', params);
    
    const result = rangeFilterPineExact(validOhlcv, params);
    
    // Write output CSV
    // Columns: time, close, smoothrng, filt, hband, lband, trend, longSignal, shortSignal
    
    let csvContent = 'time,close,smoothrng,filt,hband,lband,trend,longSignal,shortSignal\n';
    
    for(let i=0; i<validOhlcv.length; i++) {
        const timeStr = new Date(validOhlcv[i][0]).toISOString();
        const close = validOhlcv[i][4];
        const smrng = result.arrays.smoothrng[i];
        const filt = result.arrays.filt[i];
        const hband = result.arrays.hband[i];
        const lband = result.arrays.lband[i];
        const trend = result.arrays.rf_trend[i];
        const longSig = result.arrays.longSignal[i] ? 1 : 0;
        const shortSig = result.arrays.shortSignal[i] ? 1 : 0;
        
        csvContent += `${timeStr},${close},${smrng},${filt},${hband},${lband},${trend},${longSig},${shortSig}\n`;
    }
    
    fs.writeFileSync(outputFile, csvContent);
    console.log(`Output written to ${outputFile}`);
    
    // Telemetry
    const lastIdx = validOhlcv.length - 1;
    const telemetry = {
        params,
        nBars: validOhlcv.length,
        lastValues: {
            close: validOhlcv[lastIdx][4],
            filt: result.arrays.filt[lastIdx],
            trend: result.arrays.rf_trend[lastIdx]
        },
        nSignals: result.checksum, // Using checksum as proxy for signals/up trends
        nFlips: result.arrays.rf_flip.filter(f => f).length,
        maxAbsDiffFictitiousIfNoRef: false
    };
    
    console.log('Telemetry:', JSON.stringify(telemetry, null, 2));
    
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

runVerification();

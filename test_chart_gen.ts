import { getQuickChartBase64 } from './chart_generator.js';

async function run() {
  const ohlcv = [
    [1610000000000, 100, 110, 90, 105, 1000],
    [1610003600000, 105, 115, 95, 110, 1200]
  ];
  const b64 = await getQuickChartBase64('BTC/USDT', ohlcv);
  console.log(b64 ? 'Success' : 'Failed');
}
run();

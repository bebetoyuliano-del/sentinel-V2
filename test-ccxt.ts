import ccxt from 'ccxt';

async function test() {
  const binance = new ccxt.binance({
    options: { defaultType: 'future' }
  });
  await binance.loadMarkets();
  console.log(Object.keys(binance.markets).slice(0, 10));
  console.log(Object.keys(binance.markets).find(k => k.includes('UAI')));
}

test();

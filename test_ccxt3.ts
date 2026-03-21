import ccxt from 'ccxt';

const binance = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_API_SECRET,
  options: { defaultType: 'future' },
});

async function test() {
  try {
    const income = await binance.fapiPrivateGetIncome({ incomeType: 'REALIZED_PNL', limit: 5 });
    console.log(income);
  } catch (e) {
    console.error(e.message);
  }
}

test();

import ccxt from 'ccxt';
import dotenv from 'dotenv';

dotenv.config();

const binance = new ccxt.binance({
  apiKey: process.env.BINANCE_API_KEY,
  secret: process.env.BINANCE_API_SECRET,
  options: { defaultType: 'future' },
});

async function test() {
  try {
    const trades = await binance.fetchMyTrades(undefined, undefined, 5);
    console.log(trades);
  } catch (e) {
    console.error(e.message);
  }
}

test();

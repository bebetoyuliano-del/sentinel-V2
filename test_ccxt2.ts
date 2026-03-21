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
    const positions = await binance.fetchPositions();
    const symbols = positions.map(p => p.symbol).filter(s => s);
    console.log(`Found ${symbols.length} symbols`);
    if (symbols.length > 0) {
      const trades = await binance.fetchMyTrades(symbols[0], undefined, 5);
      console.log(`Trades for ${symbols[0]}:`, trades.length);
    }
  } catch (e) {
    console.error(e.message);
  }
}

test();

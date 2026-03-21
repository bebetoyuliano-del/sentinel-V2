import axios from 'axios';

export async function getQuickChartBase64(symbol: string, ohlcv: any[], timeframe: string = '4H'): Promise<string | null> {
  try {
    // Take last 60 candles for visual clarity
    const recent = ohlcv.slice(-60);
    
    const data = recent.map(c => {
      return {
        x: c[0],
        o: c[1],
        h: c[2],
        l: c[3],
        c: c[4]
      };
    });

    const chartConfig = {
      type: 'candlestick',
      data: {
        datasets: [{
          label: symbol,
          data: data,
          color: {
            up: '#00ff00',
            down: '#ff0000',
            unchanged: '#999999'
          }
        }]
      },
      options: {
        plugins: {
          title: { display: true, text: `${symbol} - ${timeframe} Chart`, color: '#ffffff' },
          legend: { display: false }
        },
        scales: {
          x: {
            type: 'time',
            ticks: { color: '#aaaaaa', maxTicksLimit: 10 }
          },
          y: {
            ticks: { color: '#aaaaaa' },
            position: 'right'
          }
        }
      }
    };

    const response = await axios.post('https://quickchart.io/chart', {
      chart: chartConfig,
      width: 800,
      height: 400,
      format: 'png',
      backgroundColor: '#131722', // TradingView dark theme
      version: '3'
    }, { 
      responseType: 'arraybuffer',
      timeout: 10000 // 10s timeout
    });

    return Buffer.from(response.data, 'binary').toString('base64');
  } catch (error: any) {
    console.error(`[CHART] Failed to generate chart for ${symbol}:`, error.message);
    if (error.response && error.response.data) {
      try {
        const errorData = Buffer.from(error.response.data).toString('utf8');
        console.error(`[CHART] QuickChart error details:`, errorData);
      } catch (e) {}
    }
    return null;
  }
}

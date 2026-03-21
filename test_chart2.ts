import axios from 'axios';

async function test() {
  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [{
        label: 'BTC',
        data: [
          { x: 1610000000000, o: 100, h: 110, l: 90, c: 105 },
          { x: 1610003600000, o: 105, h: 115, l: 95, c: 110 }
        ]
      }]
    },
    options: {
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

  try {
    const response = await axios.post('https://quickchart.io/chart', {
      chart: chartConfig,
      width: 800,
      height: 400,
      version: '3'
    });
    console.log('Success:', response.data);
  } catch (e: any) {
    console.error('Failed:', e.message);
    if (e.response && e.response.data) {
      console.error('Error data:', e.response.data);
    }
  }
}

test();

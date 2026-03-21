import axios from 'axios';

async function test() {
  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [{
        label: 'BTC',
        data: []
      }]
    }
  };

  try {
    const response = await axios.post('https://quickchart.io/chart', {
      chart: chartConfig,
      width: 800,
      height: 400,
      format: 'json'
    });
    console.log('Success');
  } catch (e: any) {
    console.error('Failed:', e.message);
  }
}

test();

import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/api/signals');
    console.log('Status:', res.data);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();

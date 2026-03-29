import axios from 'axios';
async function run() {
  try {
    const res = await axios.get('http://localhost:3000/api/status');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
run();

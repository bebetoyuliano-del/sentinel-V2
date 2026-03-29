import fs from 'fs';
const logs = fs.readFileSync('/root/.pm2/logs/sentinel-v2-error.log', 'utf8');
console.log(logs.slice(-2000));

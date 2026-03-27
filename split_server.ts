import fs from 'fs';
const lines = fs.readFileSync('server.ts', 'utf8').split('\n');
console.log(lines.length);
const p1 = lines.slice(0, 2000).join('\n');
const p2 = lines.slice(2000, 4000).join('\n');
const p3 = lines.slice(4000).join('\n');
fs.writeFileSync('server_part1.txt', p1);
fs.writeFileSync('server_part2.txt', p2);
fs.writeFileSync('server_part3.txt', p3);

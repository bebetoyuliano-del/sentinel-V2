import { execSync } from 'child_process';
console.log(execSync('pwd').toString());
console.log(execSync('ls -la').toString());
console.log(execSync('git show HEAD:server.ts | grep -A 50 "function buildCallbackData"').toString());

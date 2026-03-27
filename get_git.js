const { execSync } = require('child_process');
console.log(execSync('git show HEAD:server.ts | grep -A 50 "function buildCallbackData"').toString());

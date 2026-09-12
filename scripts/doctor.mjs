import { existsSync } from 'node:fs';
import { localConfig } from './local-config.mjs';
const {webPort,apiPort}=localConfig();
console.log(`Node.js ${process.version}; dependencies ${existsSync('node_modules')?'installed':'missing (run npm ci)'}`);
for(const [name,url] of [['Frontend',`http://localhost:${webPort}/`],['Worker',`http://127.0.0.1:${apiPort}/api/career/auth/config`],['Proxy',`http://localhost:${webPort}/api/career/auth/config`]]){
 try{const response=await fetch(url,{signal:AbortSignal.timeout(5000)});console.log(`${name}: HTTP ${response.status}`);if(!response.ok)process.exitCode=1;
 if(name==='Worker'&&response.ok){const cfg=await response.json();console.log(`Authentication: ${cfg.mode}; Google configuration: ${cfg.firebase?'present':'not configured'}`);}}
 catch{console.error(`${name}: unavailable. Start npm run dev and check port settings.`);process.exitCode=1;}
}

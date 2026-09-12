import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { localConfig } from './local-config.mjs';
const {webPort,apiPort,dataRoot}=localConfig();
// Check before spawning either service; never stop a process we do not own.
async function available(port,host) {
  await new Promise((resolve,reject)=>{
    const server=createServer();server.once('error',()=>reject(new Error(`Port ${port} on ${host} is busy. Stop your previous Career Note session or set CAREER_WEB_PORT / CAREER_API_PORT.`)));
    server.listen(port,host,()=>server.close(resolve));
  });
}
await available(webPort,'localhost');
await available(apiPort,'127.0.0.1');
mkdirSync(dataRoot,{recursive:true,mode:0o700});
const options={stdio:'inherit',detached:process.platform!=='win32',env:{...process.env,CAREER_WEB_PORT:String(webPort),CAREER_API_PROXY:process.env.CAREER_API_PROXY || `http://127.0.0.1:${apiPort}`}};
const children=[];
let stopped=false;
function stop(code=0) {
 if(stopped)return;stopped=true;
 for(const child of children){
  if(!child.pid)continue;
  if(process.platform==='win32'){spawn('taskkill',['/pid',String(child.pid),'/T','/F']);continue;}
  try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')console.error('Could not stop child service');}
 }
 setTimeout(()=>process.exit(code),500);
}
function start(args){const child=spawn(process.execPath,args,options);children.push(child);child.once('error',()=>stop(1));child.once('exit',code=>stop(code??1));}
start(['node_modules/wrangler/bin/wrangler.js','dev','--ip','127.0.0.1','--port',String(apiPort),'--persist-to',join(dataRoot,'worker-state'),'--config',process.env.CAREER_WRANGLER_CONFIG || 'wrangler.toml']);
start([process.env.npm_execpath,'run','dev:web','--','--port',String(webPort)]);
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log(`Career Note: http://localhost:${webPort} (API: 127.0.0.1:${apiPort})`);

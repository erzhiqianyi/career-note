// Exercises the real launcher and CLI with disposable D1 data. Never reads a real profile.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'career-note-smoke-'));
const webPort=Number(process.env.SMOKE_WEB_PORT || 14418),apiPort=Number(process.env.SMOKE_API_PORT || 14419);
const env={...process.env,CAREER_DATA_DIR:dir,CAREER_WEB_PORT:String(webPort),CAREER_API_PORT:String(apiPort),CAREER_API_URL:`http://127.0.0.1:${apiPort}`,CAREER_API_PROXY:`http://127.0.0.1:${apiPort}`};
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run with npm run test:smoke');
let service,output='';
function start(){output='';service=spawn(process.execPath,[npmCli,'run','dev'],{env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});service.stdout.on('data',b=>output+=b);service.stderr.on('data',b=>output+=b);}
async function stop(){if(!service||service.exitCode!==null)return;const child=service;const done=new Promise(resolve=>child.once('exit',resolve));
 if(process.platform==='win32')execFileSync('taskkill',['/pid',String(child.pid),'/T','/F']);else process.kill(-child.pid,'SIGTERM');
 await Promise.race([done,new Promise(resolve=>setTimeout(resolve,3000))]);}
async function ready(){for(let i=0;i<100;i++){
 if(service.exitCode!==null)throw new Error(`Startup exited: ${output.slice(-3000)}`);
 try{const r=await fetch(`http://localhost:${webPort}/api/career/auth/config`);if(r.ok){const config=await r.json();if(config.mode!=='off')throw new Error('Smoke test needs unconfigured local mode (no .dev.vars).');return;}}catch(error){if(error.message.includes('Smoke test'))throw error;}
 await new Promise(resolve=>setTimeout(resolve,400));
}throw new Error(`Startup timeout: ${output.slice(-3000)}`);}
const api=(p,body)=>fetch(`http://localhost:${webPort}/api/career/${p}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
function cli(command,file){return JSON.parse(execFileSync(process.execPath,['scripts/career-data.mjs',command,...(file?[file]:[])],{env}).toString());}
try{
 start();await ready();
 const state=await (await api('state')).json();if(state.jobs.length)throw new Error('Expected empty disposable workspace');
 const saved=await api('profile',{...state.profile,summary:'Smoke fixture'});if(!saved.ok)throw new Error('Profile save failed');
 cli('preview','examples/demo-jobs.json');cli('import','examples/demo-jobs.json');cli('preview','examples/demo-materials.json');cli('import','examples/demo-materials.json');
 if(cli('state').materials.length!==1)throw new Error('CLI and web did not share records');
 await stop();start();await ready();
 const again=await (await api('state')).json();
 if(again.profile.summary!=='Smoke fixture'||again.jobs.length!==1||again.materials.length!==1)throw new Error('Restart persistence failed');
 const page=await fetch(`http://localhost:${webPort}/`);if(!page.ok)throw new Error('Frontend unavailable');
 console.log('PASS: real launcher, frontend, API proxy, CLI import, D1 persistence across restart.');
}finally{await stop();rmSync(dir,{recursive:true,force:true});}

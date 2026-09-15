import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localConfig } from './local-config.mjs';
const {webPort,apiPort,dataRoot}=localConfig();
// `npm run dev` is local only. `npm run dev:tunnel` (--tunnel) publishes the API port for hosted agents:
// with CAREER_TUNNEL=<named tunnel> + CAREER_PUBLIC_ORIGIN in .env it checks and uses that tunnel,
// otherwise it opens a throwaway trycloudflare quick tunnel.
const tunnelMode=process.argv.includes('--tunnel');
const namedTunnel=tunnelMode?(process.env.CAREER_TUNNEL||''):'';
// Check before spawning either service; never stop a process we do not own.
async function available(port,host) {
  await new Promise((resolve,reject)=>{
    const server=createServer();server.once('error',()=>reject(new Error(`Port ${port} on ${host} is busy. Stop your previous Career Note session or set CAREER_WEB_PORT / CAREER_API_PORT.`)));
    server.listen(port,host,()=>server.close(resolve));
  });
}
await available(webPort,'127.0.0.1');
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
const installHint='cloudflared not found. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
function start(args,command=process.execPath){const child=spawn(command,args,options);children.push(child);child.once('error',error=>{console.error(command==='cloudflared'?installHint:String(error));stop(1);});child.once('exit',code=>stop(code??1));return child;}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
// Wrangler reads .dev.vars itself; we only peek at it to warn about the auth mode.
const devVars={};
if(existsSync('.dev.vars'))for(const line of readFileSync('.dev.vars','utf8').split('\n')){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m)devVars[m[1]]=m[2].replace(/^"(.*)"$/,'$1');}
const authMode=(process.env.CAREER_AUTH_MODE||devVars.CAREER_AUTH_MODE||(devVars.FIREBASE_PROJECT_ID?'strict':'off')).toLowerCase();

function cloudflared(args){const run=spawnSync('cloudflared',args,{encoding:'utf8'});if(run.error){console.error(installHint);process.exit(1);}return run;}
// Verifies the user's locally managed tunnel before relying on it: ingress must route our hostname to the API port,
// and at least one connector must be online. Config edits need every connector restarted; we cannot do that for them.
function checkNamedTunnel(name,origin){
 const host=new URL(origin).host;
 const rule=cloudflared(['tunnel','ingress','rule',`${origin}/api/career/mcp`]);
 const service=(rule.stdout+rule.stderr).match(/service:\s*(\S+)/)?.[1]||'';
 // Ingress may target the web port (whole app public; Vite proxies /api/career and /.well-known to the API)
 // or the API port (MCP only; the consent page stays on localhost).
 const target=service.match(/^https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)$/)?.[1];
 if(target!==String(webPort)&&target!==String(apiPort)){
  console.error(`Tunnel check failed: ~/.cloudflared/config.yml does not route ${host} to http://127.0.0.1:${webPort} (web) or :${apiPort} (API) (matched: ${service||'no rule'}).`);
  console.error(`Add this ingress entry ABOVE the catch-all "service: http_status:404", then restart every cloudflared running "${name}":`);
  console.error(`  - hostname: ${host}\n    service: http://127.0.0.1:${webPort}`);
  process.exit(1);
 }
 tunnelServesWeb=target===String(webPort);
 const info=cloudflared(['tunnel','info',name]);
 const connectors=[...(info.stdout+info.stderr).matchAll(/^[0-9a-f-]{36}\s+(\S+)/gm)].map(m=>m[1]);
 if(!connectors.length)return false;
 console.log(`Tunnel ${name}: ${connectors.length} connector(s) online (started ${connectors.join(', ')}). Ingress for ${host} -> ${service} OK.`);
 return true;
}
async function probePublic(origin){
 for(let attempt=0;attempt<6;attempt++){
  await new Promise(r=>setTimeout(r,5000));
  try{
   const response=await fetch(`${origin}/.well-known/oauth-protected-resource`,{signal:AbortSignal.timeout(15000)});
   const body=await response.text();
   if(response.ok&&body.includes(origin)){console.log(`Public check OK: ${origin}/.well-known/oauth-protected-resource`);return;}
   if(response.status===404&&attempt>=2){console.error(`Public check: ${origin} answers 404. A cloudflared connector is still running an old config (see "cloudflared tunnel info"); restart every one of them.`);return;}
   if(attempt>=2)console.error(`Public check: HTTP ${response.status} from ${origin}`);
  }catch(error){
   if(attempt<2)continue;
   const code=error.cause?.code||'';
   if(code==='ENOTFOUND'||code==='EAI_AGAIN')console.error(`Public check: this machine cannot resolve ${new URL(origin).host}. If the DNS record was just created, flush the local cache (macOS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder) or wait for it to expire; the address may already work from elsewhere.`);
   else console.error(`Public check: ${origin} not reachable yet (${error.message})`);
  }
 }
}

let publicOrigin='';
let tunnelServesWeb=false;
if(tunnelMode&&namedTunnel){
 publicOrigin=(process.env.CAREER_PUBLIC_ORIGIN||'').replace(/\/$/,'');
 if(!/^https:\/\//.test(publicOrigin)){console.error('CAREER_PUBLIC_ORIGIN must be the https address served by CAREER_TUNNEL (set both in .env).');process.exit(1);}
 if(!checkNamedTunnel(namedTunnel,publicOrigin)){
  console.log(`No connector online for ${namedTunnel}; starting "cloudflared tunnel run ${namedTunnel}" for this session.`);
  start(['tunnel','run',namedTunnel],'cloudflared');
 }
}else if(tunnelMode){
 // A dedicated config keeps a user's ~/.cloudflared/config.yml ingress rules from hijacking the quick tunnel.
 const quickConfig=join(dataRoot,'cloudflared-quick.yml');writeFileSync(quickConfig,'no-autoupdate: true\n');
 const child=spawn('cloudflared',['tunnel','--config',quickConfig,'--url',`http://127.0.0.1:${apiPort}`],{...options,stdio:['ignore','pipe','pipe']});
 children.push(child);child.once('error',()=>{console.error(installHint);stop(1);});child.once('exit',code=>stop(code??1));
 publicOrigin=await new Promise(resolve=>{const onData=chunk=>{const match=String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){child.stderr.off('data',onData);child.stdout.off('data',onData);child.stderr.resume();child.stdout.resume();resolve(match[0]);}};child.stderr.on('data',onData);child.stdout.on('data',onData);});
}
// When the tunnel serves the web port the consent page is public too; otherwise it stays on localhost.
const webOrigin=process.env.CAREER_WEB_ORIGIN||(tunnelServesWeb?publicOrigin:`http://localhost:${webPort}`);
const vars=['--var',`CAREER_WEB_ORIGIN:${webOrigin}`];
// Shell overrides beat .dev.vars so a one-off `CAREER_AUTH_MODE=off npm run dev` works without editing files.
for(const name of ['CAREER_AUTH_MODE','CAREER_OAUTH_REFRESH_DAYS','MCP_TOKEN_TTL_DAYS'])if(process.env[name])vars.push('--var',`${name}:${process.env[name]}`);
// Local runs never announce a public origin, even if .env carries tunnel settings.
vars.push('--var',`CAREER_PUBLIC_ORIGIN:${publicOrigin}`);
start(['node_modules/wrangler/bin/wrangler.js','dev','--ip','127.0.0.1','--port',String(apiPort),'--persist-to',join(dataRoot,'worker-state'),'--config',process.env.CAREER_WRANGLER_CONFIG || 'wrangler.toml',...vars]);
start([process.env.npm_execpath,'run','dev:web','--','--port',String(webPort)]);
console.log(`Career Note: http://localhost:${webPort} (API: 127.0.0.1:${apiPort})`);
if(publicOrigin){
 if(tunnelServesWeb)console.log(`Public web: ${publicOrigin}`);
 console.log(`Public MCP endpoint: ${publicOrigin}/api/career/mcp`);
 if(authMode==='off')console.log('Warning: CAREER_AUTH_MODE=off is refused over the tunnel; set strict in .dev.vars for agents to connect.');
 void probePublic(publicOrigin);
}

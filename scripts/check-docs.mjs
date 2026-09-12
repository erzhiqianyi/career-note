import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${p}/${e.name}`):[`${p}/${e.name}`]);
const files=[...readdirSync('.').filter(f=>f.endsWith('.md')),...walk('docs'),...walk('examples')].filter(f=>f.endsWith('.md'));
let failures=0;
for(const file of files){
 const s=readFileSync(file,'utf8');
 if((s.match(/^```/gm)||[]).length%2){console.error(`${file}: unclosed code fence`);failures++;}
 for(const match of s.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
  const target=match[1].split('#')[0];
  if(!target||/^https?:|^mailto:/.test(target))continue;
  if(!existsSync(resolve(dirname(file),decodeURIComponent(target)))){console.error(`${file}: missing link ${target}`);failures++;}
 }
}
console.log(`Checked ${files.length} Markdown files; ${failures} problem(s).`);if(failures)process.exitCode=1;

import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';
const paths=execFileSync('git',['ls-files','--cached','-z']).toString().split('\0').filter(Boolean);
if(!paths.length)throw new Error('No staged/tracked files. Stage the intended public files first.');
const patterns=[
 ['personal absolute path',/\/Users\/[^/]+\//],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['Google API key',/AIza[0-9A-Za-z_-]{30,}/],
 ['GitHub token',/gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}/],
 ['personal mailbox',/[A-Za-z0-9._%+-]+@(?:gmail|icloud|outlook|hotmail)\.com/i],
];
let failures=0,archives=0;
function inspect(path,bytes){
 if(/(?:^|\/)(?:\.env|\.dev\.vars)(?:$|\.)/.test(path)&&!path.endsWith('.example')||/\.(?:sqlite3?|db|pem|key)(?:$|-)/.test(path)){console.error(`${path}: forbidden private file type`);failures++;}
 if(path.endsWith('.zip')){archives++;for(const [name,data] of Object.entries(unzipSync(bytes)))inspect(`${path}!/${name}`,data);return;}
 if(/\.(?:png|jpg|jpeg|webp|woff2?|ico)$/.test(path))return;
 const s=Buffer.from(bytes).toString('utf8');
 for(const [label,regex] of patterns)if(regex.test(s)){console.error(`${path}: ${label} detected (value withheld)`);failures++;}
}
for(const path of paths)inspect(path,execFileSync('git',['show',`:${path}`],{maxBuffer:30*1024*1024}));
console.log(`Inspected ${paths.length} public files and ${archives} ZIP archives; ${failures} finding(s).`);
console.log('This targeted check is not a complete secret scanner; review staged text and image provenance too.');
if(failures)process.exitCode=1;

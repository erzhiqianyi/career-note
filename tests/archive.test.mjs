import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { zipSync, unzipSync, strFromU8 } from 'fflate';
import { build } from '../scripts/archive-skills.mjs';
function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),'career-archive-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const name of ['AGENTS.md','docs/agent-workflow.md','docs/skills.md','scripts/archive-skills.mjs']) {
  mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),'Project documentation');
 }
 mkdirSync(join(root,'.agents/skills/sample'),{recursive:true});
 writeFileSync(join(root,'.agents/skills/sample/SKILL.md'),'---\nname: sample\ndescription: Test skill\n---\n# Test\n');
 writeFileSync(join(root,'private.sqlite3'),'private sentinel'); return root;
}
void test('archives round-trip; repeat keeps version; updates preserve history; excludes personal data',t=>{
 const root=fixture(t);const first=build(root);assert.deepEqual(build(root),first);
 const path=join(root,'public',first.archiveUrl);const old=readFileSync(path);
 const zip=unzipSync(old);assert.equal(zip['private.sqlite3'],undefined);
 for(const item of JSON.parse(strFromU8(zip['manifest.json'])).files) assert.deepEqual(Buffer.from(zip[item.path]),readFileSync(join(root,item.path)));
 writeFileSync(join(root,'.agents/skills/sample/SKILL.md'),'---\nname: sample\ndescription: Updated\n---\n# Test\n');
 assert.equal(build(root).history.length,2);assert.deepEqual(readFileSync(path),old);
});
void test('rejects external symlinks',t=>{
 const root=fixture(t);symlinkSync(join(root,'private.sqlite3'),join(root,'.agents/skills/sample/private.txt'));
 assert.throws(()=>build(root),/Symlinks/);
});
void test('rejects corrupt archive content',t=>{
 const root=fixture(t);const first=build(root);const path=join(root,'public',first.archiveUrl);
 const zip=unzipSync(readFileSync(path));zip['AGENTS.md']=new TextEncoder().encode('tampered');writeFileSync(path,zipSync(zip));
 assert.throws(()=>build(root),/content mismatch/);
});

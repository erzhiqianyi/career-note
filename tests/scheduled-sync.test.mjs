import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSyncSchedule} from '../lib/scheduled-sync.ts';
const example={source:'Example mailbox: folder Applications',scope:'status',cadence:'weekly',time:'09:30',timezone:'Asia/Tokyo',days:7};
test('schedule requires bounded sources and valid local time and window',()=>{
 for(const patch of [{source:''},{source:'x'.repeat(4001)},{time:'25:00'},{days:0},{days:2.5},{timezone:'invalid/timezone'},{scope:'overwrite'},{cadence:'hourly'}]) assert.throws(()=>buildSyncSchedule({...example,...patch}));
});
test('schedule preserves scoped source text and distinguishes draft from activation',()=>{
 const source='mail folder "Applications"\nOnly this folder';
 const prompt=buildSyncSchedule({...example,source});
 assert.ok(prompt.includes(JSON.stringify(source)));
 assert.ok(prompt.includes('每周一 09:30'));
 assert.ok(prompt.includes('Asia/Tokyo'));
 assert.ok(prompt.includes('网页没有创建或启用定时任务'));
 assert.ok(prompt.includes('不自动更新履历或投递状态'));
 assert.ok(!prompt.includes('RRULE'));
});

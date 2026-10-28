import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const compiled = await build({
  entryPoints: ['lib/calendar-events.ts'], bundle: true, write: false,
  format: 'cjs', platform: 'node',
});
const cjsModule = { exports: {} };
runInNewContext(compiled.outputFiles[0].text, { module: cjsModule, exports: cjsModule.exports, Date });
const { eventsFromReports, eventIcs } = cjsModule.exports;

test('only structured schedule reports appear as events', () => {
  const reports = [
    { id: 'normal', date: '2026-10-26', title: 'Daily', sourceNotes: 'ordinary report' },
    { id: 'invalid', date: '2026-10-28', title: 'Wrong day', sourceNotes: 'career-event-v1:{"date":"2026-10-29","timeStatus":"unknown","status":"confirmed","kind":"interview"}' },
    { id: 'meeting', date: '2026-10-29', title: 'Consultation', content: '仮予約', sourceNotes: 'career-event-v1:{"date":"2026-10-29","start":"10:00","end":"11:30","timeStatus":"end-estimated","status":"provisional","kind":"counseling"}' },
  ];
  const events = eventsFromReports(reports);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'meeting');
  assert.equal(events[0].status, 'provisional');
});

test('calendar export uses Tokyo time and preserves tentative status', () => {
  const event = eventsFromReports([{ id: 'meeting', date: '2026-10-29', title: '咨询, 仮予約', content: '等待确认', sourceNotes: 'career-event-v1:{"date":"2026-10-29","start":"10:00","end":"11:30","timeStatus":"end-estimated","status":"provisional","kind":"counseling"}' }])[0];
  const ics = eventIcs(event);
  assert.match(ics, /DTSTART:20261029T010000Z/);
  assert.match(ics, /DTEND:20261029T023000Z/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /SUMMARY:咨询\\, 仮予約/);
  assert.equal(eventIcs({ ...event, start: undefined, timeStatus: 'unknown' }), null);
});

const { parseEventHeader, withEventHeader } = cjsModule.exports;
const header = (json) => `career-event-v1:${JSON.stringify(json)}\n来源`;

test('a newer version supersedes, and a removed report leaves, the calendar', () => {
  const reports = [
    { id: 'old', date: '2026-10-29', title: '仮予約', content: '', sourceNotes: header({ date: '2026-10-29', start: '10:00', end: '11:30', timeStatus: 'end-estimated', status: 'provisional', kind: 'counseling' }) },
    { id: 'new', date: '2026-10-29', title: '確定', content: '', sourceNotes: header({ date: '2026-10-29', start: '10:05', end: '11:30', timeStatus: 'end-estimated', status: 'confirmed', kind: 'counseling', supersedes: ['old'] }) },
    { id: 'gone', date: '2026-10-30', title: '削除済み', content: '', archivedAt: '2026-10-28T00:00:00Z', sourceNotes: header({ date: '2026-10-30', timeStatus: 'unknown', status: 'confirmed', kind: 'interview' }) },
  ];
  assert.deepEqual(eventsFromReports(reports).map((event) => event.id), ['new']);
  assert.equal(eventsFromReports(reports)[0].supersedes, undefined);
  // A removed replacement no longer hides what it replaced.
  assert.deepEqual(eventsFromReports([reports[0], { ...reports[1], archivedAt: '2026-10-28T00:00:00Z' }]).map((event) => event.id), ['old']);
});

test('cancelled events export as cancelled and headers are validated', () => {
  const [event] = eventsFromReports([{ id: 'c', date: '2026-10-28', title: '面接', content: '', sourceNotes: header({ date: '2026-10-28', start: '10:00', end: '11:00', timeStatus: 'exact', status: 'cancelled', kind: 'interview', supersedes: 'x' }) }]);
  assert.equal(event.status, 'cancelled');
  assert.match(eventIcs(event), /STATUS:CANCELLED/);
  assert.equal(parseEventHeader('ordinary', '2026-10-28'), null);
  assert.ok(parseEventHeader('career-event-v1:{bad', '2026-10-28').error);
  assert.ok(parseEventHeader(header({ date: '2026-10-28', timeStatus: 'exact', status: 'confirmed', kind: 'interview' }), '2026-10-28').error);
  assert.ok(parseEventHeader(header({ date: '2026-10-28', timeStatus: 'unknown', status: 'done', kind: 'interview' }), '2026-10-28').error);
  assert.equal(JSON.stringify(parseEventHeader(header({ date: '2026-10-28', timeStatus: 'unknown', status: 'confirmed', kind: 'fair', supersedes: 'a' }), '2026-10-28').supersedes), '["a"]');
});

test('events carry reference links and a todo list', () => {
  const base = { date: '2026-10-29', start: '10:00', end: '11:00', timeStatus: 'exact', status: 'confirmed', kind: 'interview' };
  const parsed = parseEventHeader(header({ ...base, links: [{ label: '求人票', url: 'https://example.com/job' }, { url: 'https://example.com/map' }], todos: [{ text: ' 職務経歴書を印刷 ', done: true }, { text: '会場までの経路を確認' }] }), '2026-10-29');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.links)), [{ label: '求人票', url: 'https://example.com/job' }, { label: '', url: 'https://example.com/map' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.todos)), [{ text: '職務経歴書を印刷', done: true }, { text: '会場までの経路を確認', done: false }]);
  const [event] = eventsFromReports([{ id: 'e', date: '2026-10-29', title: '面接', content: '', sourceNotes: header({ ...base, links: parsed.links, todos: parsed.todos }) }]);
  assert.match(eventIcs(event), /求人票: https:\/\/example\.com\/job/);
  assert.match(eventIcs(event), /☑ 職務経歴書を印刷/);
  assert.ok(parseEventHeader(header({ ...base, links: [{ url: 'javascript:alert(1)' }] }), '2026-10-29').error);
  assert.ok(parseEventHeader(header({ ...base, links: 'https://example.com' }), '2026-10-29').error);
  assert.ok(parseEventHeader(header({ ...base, todos: [{ text: '  ' }] }), '2026-10-29').error);
  assert.ok(parseEventHeader(header({ ...base, todos: [{ text: 'x', done: 'yes' }] }), '2026-10-29').error);
});

test('rewriting the header keeps the source notes after it', () => {
  const next = { date: '2026-10-29', start: '10:05', end: '11:00', timeStatus: 'exact', status: 'confirmed', kind: 'counseling' };
  assert.equal(withEventHeader(header({ date: '2026-10-29', timeStatus: 'unknown', status: 'provisional', kind: 'counseling' }), next), `career-event-v1:${JSON.stringify(next)}\n来源`);
  assert.equal(withEventHeader('career-event-v1:{}', next), `career-event-v1:${JSON.stringify(next)}`);
  assert.equal(withEventHeader('来源のみ', next), `career-event-v1:${JSON.stringify(next)}\n来源のみ`);
});

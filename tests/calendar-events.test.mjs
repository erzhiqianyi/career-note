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

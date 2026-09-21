import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeHTML } from '../lib/personalized-resume.ts';

test('resume rendering repairs imported paragraph escapes without exposing markup', () => {
  const content = {
    name: 'Example', headline: 'Engineer', location: '', links: [], readings: {},
    summary: 'First paragraph\\n\\nSecond <script>alert(1)</script>',
    sections: [{ heading: 'Skills', items: [
      { title: 'Java', subtitle: 'Backend', period: '', bullets: [] },
      { title: 'Project', subtitle: '', period: '2024', bullets: [] },
    ] }],
  };
  const html = resumeHTML(content, 'en');
  assert.ok(html.includes('First paragraph\n\nSecond &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<small>Backend</small>'));
  assert.ok(html.includes('<small>2024</small>'));
  assert.ok(!html.includes('<ul></ul>'));
});

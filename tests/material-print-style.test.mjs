import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialPrintBody, materialPrintStyle } from '../lib/material-print-style.ts';

void test('application boxes contain every paragraph until the next section', () => {
  const body = '<h2>志望動機・特技・自己PRなど</h2><p>自己PR</p><p>志望動機</p><h2>本人希望記入欄</h2><p>希望</p>';
  const html = materialPrintBody('履歴書', body);
  assert.match(html, /<section class="application-box"><h2>志望動機・特技・自己PRなど<\/h2><div class="application-box-content"><p>自己PR<\/p><p>志望動機<\/p><\/div><\/section>/);
  assert.match(html, /<section class="application-box"><h2>本人希望記入欄<\/h2><div class="application-box-content"><p>希望<\/p><\/div><\/section>/);
  assert.equal(materialPrintBody('職務経歴書', body), body);
});

void test('both print styles use A4 and distinct reference layouts', () => {
  assert.match(materialPrintStyle('履歴書'), /@page\{size:A4/);
  assert.match(materialPrintStyle('履歴書'), /@page\{size:A4;margin:0\}/);
  assert.match(materialPrintStyle('履歴書'), /box-decoration-break:clone/);
  assert.match(materialPrintStyle('履歴書'), /td:nth-child\(1\)\{width:16mm[^}]*white-space:nowrap/);
  assert.match(materialPrintStyle('履歴書'), /border:1px solid #333/);
  assert.match(materialPrintStyle('職務経歴書'), /border-left:2\.5px solid #294c79/);
});

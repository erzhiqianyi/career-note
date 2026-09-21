import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHints, terms } from '../lib/interview-hints.ts';

const question = {
  id: 'etl', title: 'ETL パイプラインの設計事例', category: '经历与技术', targetSeconds: 120,
  questionJa: 'これまでに設計した ETL パイプラインについて、課題と工夫を教えてください。',
  meaning: '介绍你设计过的 ETL 管道。', why: '必須要件の中核。', outline: '背景 → 課題 → 設計判断 → 結果。',
  followUps: '冪等性はどう担保しましたか。障害時の再実行は？',
};
const job = {
  id: 'j1', company: 'ネクストデータ', role: 'データエンジニア', url: '', sourceDate: '', matchLevel: '', status: '面试中', priority: '高',
  nextAction: '', nextDate: '', notes: '', history: [], revision: 1, updatedAt: '', location: '', salary: '', foreigner: '', visa: '', japanese: '',
  description: '- BigQuery に取り込む ETL/ELT パイプラインの設計・実装（Python / Airflow / dbt）\n- Terraform による GCP リソース管理',
  requirements: '【必須】\n- SQL を用いたデータ加工 3 年以上\n【歓迎】\n- Cloud Composer、dbt の利用経験',
  business: '小売向けデータ基盤 SaaS。', matchNotes: '- Spark ETL 共通基盤の経験が要件に直結。', unknowns: '',
};
const resume = [
  { id: 'emp', kind: 'employment', language: 'ja', revision: 1, parentId: '', sourceNotes: '', verification: 'recorded', archived: false, updatedAt: '',
    data: { employer: 'iSoftStone', role: 'Senior Software Engineer', responsibilities: '- 設定可能な Spark ETL フレームワークを設計・構築。\n- GCP 上のリリース作業を担当。', technologies: 'Java、Python、Spark、GCP' } },
  { id: 'old', kind: 'employment', language: 'ja', revision: 1, parentId: '', sourceNotes: '', verification: 'recorded', archived: true, updatedAt: '',
    data: { employer: 'Archived Co', role: 'dbt engineer', responsibilities: 'dbt と Airflow を毎日使った。' } },
  { id: 'doc', kind: 'document', language: 'ja', revision: 1, parentId: '', sourceNotes: '', verification: 'recorded', archived: false, updatedAt: '',
    data: { title: '職務経歴書', version: '1', content: 'Airflow Airflow Airflow' } },
];

void test('terms: phrases stay whole, stop words and generic katakana drop out', () => {
  const found = terms('Cloud Composer と BigQuery でデータの ETL を運用。id は ms 単位。');
  assert.deepEqual([...found.values()], ['Cloud Composer', 'BigQuery', 'ETL', '運用']);
});

void test('hints separate what the résumé has from what the posting asks for, and quote the matching lines', () => {
  const h = buildHints(question, job, resume);
  assert.ok(h.keywords.includes('ETL') && h.keywords.includes('Spark') && h.keywords.includes('Python'), h.keywords.join());
  assert.ok(h.gaps.includes('dbt') && h.gaps.includes('Airflow') && h.gaps.includes('BigQuery'), h.gaps.join());
  // Archived records and document versions never count as "in the résumé".
  assert.ok(!h.keywords.includes('dbt') && !h.keywords.includes('Airflow'));
  assert.equal(h.company[0].field, '仕事内容');
  assert.match(h.company[0].text, /パイプライン/);
  assert.equal(h.resume.length, 1);
  assert.equal(h.resume[0].id, 'emp');
  assert.match(h.resume[0].lines[0], /Spark ETL/);
});

void test('without a job the hints still come from the résumé alone', () => {
  const h = buildHints(question, undefined, resume);
  assert.deepEqual(h.company, []);
  assert.deepEqual(h.gaps, []);
  assert.ok(h.keywords.includes('ETL'));
});

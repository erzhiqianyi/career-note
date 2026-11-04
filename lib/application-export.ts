import type { ApplicationDoc, Job, Material } from './career';
import { plainJapanese } from './japanese-readings';
import type { PrintTemplate } from './resume-print';

export const exportKinds: Record<PrintTemplate, '履歴書' | '職務経歴書'> = { rirekisho: '履歴書', shokumu: '職務経歴書' };

const latest = (materials: Material[], jobId: string, kind: string) =>
  materials.filter(m => m.jobId === jobId && m.kind === kind && !m.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
function section(content: string, heading: string) {
  const start = new RegExp(`^#{2,3}\\s*${heading}[^\\n]*\\n`, 'm').exec(content);
  if (!start) return '';
  const rest = content.slice(start.index + start[0].length);
  const next = /^#{1,3}\s/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** What is saved on the job wins; a first export starts from the company's newest saved documents. */
export function applicationDocDefaults(job: Job, materials: Material[], basicsEmail = ''): ApplicationDoc {
  if (job.applicationDoc) return job.applicationDoc;
  const resume = latest(materials, job.id, '履歴書')?.content || '';
  const motivation = latest(materials, job.id, '志望動機')?.content.replace(/^#[^\n]*\n/, '').trim() || '';
  return {
    motivation: plainJapanese(section(resume, '志望動機') || motivation),
    wishes: plainJapanese(section(resume, '本人希望記入欄')),
    email: /E-mail[^\n]*?([\w.+-]+@[\w.-]+)/.exec(resume)?.[1] || basicsEmail,
  };
}

/** A new version only when the exported body differs from the newest saved one. */
export function exportSnapshot(job: Job, materials: Material[], template: PrintTemplate, content: string, date: string, sources: string[]) {
  const kind = exportKinds[template];
  if (latest(materials, job.id, kind)?.content === content) return null;
  return {
    id: `${job.id.slice(0, 70)}-${template}-export-${Date.now().toString(36)}`,
    jobId: job.id,
    kind,
    title: `${job.company}｜${kind}（資料から出力 ${date}）`,
    content,
    sourceNotes: `${date} 履歴資料から出力。参照：${sources.join('、')}`.slice(0, 30000),
    reviewItems: [],
  };
}

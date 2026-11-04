'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, TriangleAlert } from 'lucide-react';
import { api, apiBlob, apiDelete, apiUpload, type ApplicationDoc, type Job, type State } from '@/lib/career';
import { applicationDocDefaults, exportKinds, exportSnapshot } from '@/lib/application-export';
import { printableEntries, resumePrintFilename, resumePrintHTML, resumePrintMarkdown, resumePrintWarnings, type PrintTemplate } from '@/lib/resume-print';
import { useLocale } from './locale-provider';

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** Builds the application documents from the current resume records; each printed version is kept as a material. */
export function ApplicationExport({ job, data, reload, onBack }: { job: Job; data: State; reload: () => Promise<unknown>; onBack: () => void }) {
  const { t } = useLocale();
  const frame = useRef<HTMLIFrameElement>(null);
  const entries = useMemo(() => printableEntries(data.resume || [], 'ja'), [data.resume]);
  const basics = entries.find(e => e.kind === 'basics')?.data || {};
  const [template, setTemplate] = useState<PrintTemplate>('rirekisho');
  const [date, setDate] = useState(data.today);
  const [doc, setDoc] = useState<ApplicationDoc>(() => applicationDocDefaults(job, data.materials, basics.email));
  const [photo, setPhoto] = useState('');
  const [photoVersion, setPhotoVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let cancelled = false;
    // A 404 only means no photo has been uploaded yet.
    apiBlob('material-files/content?kind=photo').then(dataUrl).then(url => { if (!cancelled) setPhoto(url); }).catch(() => { if (!cancelled) setPhoto(''); });
    return () => { cancelled = true; };
  }, [photoVersion]);
  const options = { template, date, email: doc.email, motivation: doc.motivation, wishes: doc.wishes };
  const html = resumePrintHTML(entries, { ...options, photo }).replace(/<title>[^<]*<\/title>/, `<title>${resumePrintFilename(basics.name || '', template, date)}</title>`);
  const warnings = resumePrintWarnings(entries, template);
  const missing = template === 'rirekisho' ? [!doc.motivation.trim() && '志望動機', !doc.wishes.trim() && '本人希望記入欄', !photo && '证件照'].filter(Boolean) as string[] : [];
  const field = (key: keyof ApplicationDoc) => (event: { target: { value: string } }) => setDoc(value => ({ ...value, [key]: event.target.value }));

  async function saveDoc() {
    const current = job.applicationDoc;
    if (current && current.motivation === doc.motivation && current.wishes === doc.wishes && current.email === doc.email) return;
    await api('jobs/application-doc', { id: job.id, revision: job.revision, applicationDoc: doc });
  }
  async function exportDocument() {
    setBusy(true); setError(''); setNotice('');
    try {
      await saveDoc();
      const snapshot = exportSnapshot(job, data.materials, template, resumePrintMarkdown(entries, options), date, entries.map(e => `${e.id} r${e.revision}`));
      if (snapshot) await api('import', { schemaVersion: 1, materials: [snapshot], completeTaskIds: [] });
      await reload();
      setNotice(t(snapshot ? '已保存这次导出的版本。' : '内容与最新版本相同，没有新增版本。'));
      await frame.current?.contentDocument?.querySelector<HTMLImageElement>('img')?.decode().catch(() => undefined);
      frame.current?.contentWindow?.print();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('导出失败')); }
    finally { setBusy(false); }
  }
  async function changePhoto(file?: File) {
    setBusy(true); setError('');
    try {
      if (file) await apiUpload('material-files?kind=photo', new Blob([file], { type: file.type || 'image/jpeg' }));
      else await apiDelete('material-files?kind=photo');
      setPhotoVersion(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('上传失败')); }
    finally { setBusy(false); }
  }
  return <section className="panel material-print-page">
    <div className="material-print-toolbar">
      <button className="secondary" onClick={onBack}><ArrowLeft size={16} />{t('返回公司')}</button>
      <div className="material-print-heading">
        <h1>{job.company}<span className="material-print-kind"> · {t('从资料导出')}</span></h1>
        {(warnings.length > 0 || missing.length > 0) && <details className="material-print-alert">
          <summary><TriangleAlert size={15} aria-hidden="true" />{t('打印前需核对')}</summary>
          <div><p>{[...warnings, ...missing].map(item => t(item)).join('、')}</p></div>
        </details>}
      </div>
      <button className="primary" disabled={busy} onClick={() => void exportDocument()}><Printer size={16} />{t('打印 / 保存为 PDF')}</button>
    </div>
    <div className="application-export-form">
      <div className="application-export-row">
        <nav className="resume-sub-tabs" aria-label={t('文书类型')}>
          {(Object.keys(exportKinds) as PrintTemplate[]).map(value => <button key={value} type="button" aria-current={template === value ? 'page' : undefined} onClick={() => setTemplate(value)}>{t(exportKinds[value])}</button>)}
        </nav>
        <label className="field">{t('文书日期')}<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        {template === 'rirekisho' && <label className="field">{t('投递邮箱')}<input type="email" value={doc.email} onChange={field('email')} /></label>}
      </div>
      {template === 'rirekisho' && <>
        <label className="field">{t('志望動機')}<textarea rows={4} value={doc.motivation} onChange={field('motivation')} /></label>
        <label className="field">{t('本人希望記入欄')}<textarea rows={4} value={doc.wishes} onChange={field('wishes')} /></label>
        <div className="material-file-controls">
          <label>{t('上传证件照')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void changePhoto(event.target.files?.[0]); event.target.value = ''; }} /></label>
          {photo && <button className="secondary" disabled={busy} onClick={() => void changePhoto()}>{t('移除照片')}</button>}
        </div>
      </>}
    </div>
    {error && <p role="alert" className="inline-note">{error}</p>}
    {notice && <output className="inline-note">{notice}</output>}
    <p className="resume-print-note">{t('内容来自当前履历资料。A4 · 缩放 100% · 关闭页眉页脚')}</p>
    <iframe ref={frame} title={t('投递版预览')} srcDoc={html} className="resume-print-preview" />
  </section>;
}

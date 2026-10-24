'use client';
import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Download, Printer, TriangleAlert } from 'lucide-react';
import { api, apiBlob, apiDelete, apiUpload, type Material } from '@/lib/career';
import { useLocale } from './locale-provider';
import { plainJapanese } from '@/lib/japanese-readings';
import { prepareMaterialPrint } from '@/lib/material-print-content';
import { materialPrintBody, materialPrintStyle } from '@/lib/material-print-style';

type SavedFile = { kind: 'pdf' | 'photo'; size: number; uploadedAt: string };

/** Print the saved company material, never regenerate from live profile records. */
export function MaterialPrint({ material, companyName, onBack }: { material: Material; companyName: string; onBack: () => void }) {
  const { t } = useLocale();
  const frame = useRef<HTMLIFrameElement>(null);
  const [files, setFiles] = useState<{ pdf: SavedFile | null; photo: SavedFile | null }>({ pdf: null, photo: null });
  const [pdfUrl, setPdfUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [showOriginal, setShowOriginal] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    async function load() {
      try {
        const saved = await api<{ pdf: SavedFile | null; photo: SavedFile | null }>('material-files?id=' + encodeURIComponent(material.id));
        if (cancelled) return;
        setFiles(saved);
        const [pdf, photo] = await Promise.all([
          saved.pdf ? apiBlob('material-files/content?id=' + encodeURIComponent(material.id) + '&kind=pdf') : null,
          saved.photo ? apiBlob('material-files/content?id=' + encodeURIComponent(material.id) + '&kind=photo') : null,
        ]);
        if (cancelled) return;
        if (pdf) { const url = URL.createObjectURL(pdf); urls.push(url); setPdfUrl(url); } else setPdfUrl('');
        if (photo) { const url = URL.createObjectURL(photo); urls.push(url); setPhotoUrl(url); } else setPhotoUrl('');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t('读取文件失败'));
      }
    }
    void load();
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [material.id, revision, t]);
  async function upload(kind: 'pdf' | 'photo', file: File | undefined) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const mime = file.type || (kind === 'pdf' ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg');
      await apiUpload('material-files?id=' + encodeURIComponent(material.id) + '&kind=' + kind, new Blob([file], { type: mime }));
      setRevision(value => value + 1);
      if (kind === 'pdf') setShowOriginal(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('上传失败')); }
    finally { setBusy(false); }
  }
  async function remove(kind: 'pdf' | 'photo') {
    setBusy(true); setError('');
    try {
      await apiDelete('material-files?id=' + encodeURIComponent(material.id) + '&kind=' + kind);
      setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('删除失败')); }
    finally { setBusy(false); }
  }
  const { printableContent, internalNotes, hasPlaceholders } = prepareMaterialPrint(material.content);
  const body = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{plainJapanese(printableContent)}</ReactMarkdown>);
  const title = material.kind === '履歴書' ? '履歴書' : '職務経歴書';
  const photo = title === '履歴書' && photoUrl ? `<img class="passport-photo" alt="証明写真" src="${photoUrl}">` : '';
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title><style>${materialPrintStyle(title)}</style></head><body><main class="${photo ? 'has-photo' : ''}">${materialPrintBody(title, body)}${photo}</main></body></html>`;
  return <section className="panel material-print-page">
    <div className="material-print-toolbar">
      <button className="secondary" aria-label={t('返回 {0}', [material.title])} onClick={onBack}><ArrowLeft size={16} />{t('返回文档')}</button>
      <div className="material-print-heading">
        <h1>{companyName}<span className="material-print-kind"> · {t(title)}</span></h1>
        {(internalNotes.length > 0 || hasPlaceholders) && <details className="material-print-alert">
          <summary><TriangleAlert size={15} aria-hidden="true" />{t('打印前需核对')}</summary>
          <div>{internalNotes.length > 0 && <p>{t('内部备注已从打印正文排除。')}</p>}{hasPlaceholders && <p>{t('打印正文仍有待填写项，请核对。')}</p>}</div>
        </details>}
      </div>
      <button className="primary" onClick={() => showOriginal && pdfUrl ? window.open(pdfUrl, '_blank', 'noopener') : frame.current?.contentWindow?.print()}><Printer size={16} />{t('打印 / 保存为 PDF')}</button>
    </div>
    <div className="material-file-controls">
      <label>{t('上传原版 PDF')}<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { void upload('pdf', event.target.files?.[0]); event.target.value = ''; }} /></label>
      {title === '履歴書' && <label>{t('上传证件照')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void upload('photo', event.target.files?.[0]); event.target.value = ''; }} /></label>}
      {files.pdf && <>
        <span>{t('原版 PDF 已保存')}</span>
        <button className="secondary" onClick={() => setShowOriginal(true)} disabled={showOriginal}>{t('原版 PDF')}</button>
        <button className="secondary" onClick={() => setShowOriginal(false)} disabled={!showOriginal}>{t('排版预览')}</button>
        {pdfUrl && <a className="secondary" href={pdfUrl} download={`${title}_${companyName}.pdf`}><Download size={15} />{t('下载 PDF')}</a>}
        <button className="secondary" onClick={() => void remove('pdf')} disabled={busy}>{t('移除 PDF')}</button>
      </>}
      {title === '履歴書' && files.photo && <><span>{t('证件照已保存，同一账号的履歴書共用')}</span><button className="secondary" onClick={() => void remove('photo')} disabled={busy}>{t('移除照片')}</button></>}
    </div>
    {error && <p role="alert" className="inline-note">{error}</p>}
    <p className="resume-print-note">{t('A4 · 缩放 100% · 关闭页眉页脚')}</p>
    {showOriginal && files.pdf && pdfUrl ? <iframe title={t('原版 PDF')} src={pdfUrl} className="resume-print-preview" /> : <iframe ref={frame} title={t('投递版预览')} srcDoc={html} className="resume-print-preview" />}
  </section>;
}

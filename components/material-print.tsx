'use client';
import { useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Printer } from 'lucide-react';
import type { Material } from '@/lib/career';
import { useLocale } from './locale-provider';
import { plainJapanese } from '@/lib/japanese-readings';

/** Print the saved company material, never regenerate from live profile records. */
export function MaterialPrint({ material, onBack }: { material: Material; onBack: () => void }) {
  const { t } = useLocale();
  const frame = useRef<HTMLIFrameElement>(null);
  const body = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{plainJapanese(material.content)}</ReactMarkdown>);
  const title = material.kind === '履歴書' ? '履歴書' : '職務経歴書';
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}
    body{margin:0;color:#3e506a;background:#eee;font:11pt/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic",sans-serif}
    main{width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:16mm;background:white;overflow-wrap:anywhere}
    h1{margin:0 0 12px;font-size:22pt;line-height:1.3;color:#3e506a}
    h2{margin:30px 0 18px;font-size:16pt;line-height:1.4;color:#3e506a}
    h3{margin:26px 0 14px;font-size:12pt;color:#3e506a}
    h1,h2,h3{break-after:avoid}
    p{margin:0 0 20px;white-space:pre-wrap;orphans:3;widows:3}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    td,th{border:1px solid #dde1e5;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:#f5f6f8;color:#343a43}
    thead{display:table-header-group}tr,li{break-inside:avoid}img{max-width:100%}a{color:inherit}
    @media print{body{background:white}main{width:auto;max-width:none;min-height:0;padding:0;margin:0}}
    </style></head><body><main>${body}</main></body></html>`;
  return <section className="panel material-print-page">
    <div className="material-print-toolbar">
      <button className="secondary" aria-label={t('返回 {0}', [material.title])} onClick={onBack}><ArrowLeft size={16} />{t('返回文档')}</button>
      <div className="material-print-heading"><h1>{t('打印预览')}</h1><p>{material.title} · {material.createdAt.slice(0, 10)}</p></div>
      <button className="primary" onClick={() => frame.current?.contentWindow?.print()}><Printer size={16} />{t('打印 / 保存为 PDF')}</button>
    </div>
    <p className="resume-print-note">{t('A4 · 缩放 100% · 关闭页眉页脚')}</p>
    <iframe ref={frame} title={t('投递版预览')} srcDoc={html} className="resume-print-preview" />
  </section>;
}

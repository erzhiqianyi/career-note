'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Copy, Download, Search, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocale } from '@/components/locale-provider';
import { DataActions, DataCell, DataRow, DataTable, DataTitle } from '@/components/data-table';
import archive from '@/lib/skill-archive.generated.json';
const order = [
  'career-profile-intake',
  'career-job-research',
  'career-application-materials',
  'career-interview-coach',
  'career-outcome-review',
  'career-workspace-sync',
  'career-source-sync',
  'career-job-prep',
];
export default function SkillArchive() {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<
    (typeof archive.skills)[number] | null
  >(null);
  const [document, setDocument] = useState('');
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  const skills = [...archive.skills]
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    .filter((skill) =>
      `${skill.name} ${skill.title} ${t(skill.title)} ${skill.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(t('已复制调用指令'));
    } catch {
      setMessage(t('复制失败，请在详情中手动复制。'));
    }
  }
  return (
    <section className="panel skill-archive">
      <div className="section-head">
        <h2>{t('选择本次要做的事')}</h2>
        <a className="text-button" href={archive.archiveUrl} download>
          <Download size={16} />
          {t('下载全部技能')}
        </a>
      </div>
      <p className="muted page-note">
        {t('每个技能都可独立安装，通过已配置的 MCP 读取与同步你的资料。')}
      </p>
      <div className="collection-toolbar">
        <label className="search">
          <Search size={16} />
          <input
            aria-label={t('搜索技能')}
            placeholder={t('搜索技能')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="record-meta">
          {skills.length} / {archive.skills.length}
        </span>
      </div>
      {skills.length > 0 && (
        <DataTable
          label={t('技能列表')}
          columns={[
            { key: 'skill', label: t('技能'), width: 'minmax(180px, 1fr)' },
            { key: 'desc', label: t('用途'), width: 'minmax(200px, 1.6fr)', hide: 'phone' },
            { key: 'ops', label: t('操作'), width: '108px', align: 'end' },
          ]}
        >
          {skills.map((skill) => {
            const open = () => {
              setSelected(skill);
              setDocument('');
            };
            return (
              <DataRow key={skill.name}>
                <DataTitle title={t(skill.title)} meta={<code>{skill.name}</code>} onClick={open} />
                <DataCell hide="phone" className="ellipsis muted" title={t(skill.description)}>
                  {t(skill.description)}
                </DataCell>
                <DataActions>
                  <button className="icon-button" onClick={open} title={t('查看详情')} aria-label={`${t('查看详情')} ${t(skill.title)}`}>
                    <BookOpen size={16} />
                  </button>
                  <button className="icon-button" onClick={() => void copy(skill.prompt)} title={t('复制指令')} aria-label={`${t('复制指令')} ${t(skill.title)}`}>
                    <Copy size={16} />
                  </button>
                  <a className="icon-button" href={skill.downloadUrl} download title={t('下载')} aria-label={`${t('下载')} ${t(skill.title)}`}>
                    <Download size={16} />
                  </a>
                </DataActions>
              </DataRow>
            );
          })}
        </DataTable>
      )}
      {!skills.length && <p className="empty">{t('没有匹配的技能')}</p>}
      <output aria-live="polite" className="skill-copy-status">
        {message}
      </output>
      <details className="skill-history">
        <summary>
          {t('历史备份')} · {archive.history.length}
        </summary>
        <DataTable
          label={t('历史备份')}
          columns={[
            { key: 'at', label: t('时间'), width: 'minmax(160px, 1fr)' },
            { key: 'size', label: t('内容'), width: 'minmax(160px, 1fr)', hide: 'phone' },
            { key: 'ops', label: t('操作'), width: '44px', align: 'end' },
          ]}
        >
          {archive.history.map((item) => (
            <DataRow key={item.revision}>
              <DataCell className="num">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}
              </DataCell>
              <DataCell hide="phone" className="muted">
                {`${item.skillCount} skills · ${Math.ceil(item.bytes / 1024)} KB · ${item.revision.slice(0, 8)}`}
              </DataCell>
              <DataActions>
                <a className="icon-button" href={item.url} download title={t('下载')} aria-label={t('下载')}>
                  <Download size={16} />
                </a>
              </DataActions>
            </DataRow>
          ))}
        </DataTable>
      </details>
      <dialog
        ref={dialog}
        className="skill-dialog"
        onClose={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        {selected && (
          <>
            <header className="skill-dialog-header">
              <div>
                <h2>{t(selected.title)}</h2>
                <code>{selected.name}</code>
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label={t('关闭')}
                onClick={() => dialog.current?.close()}
              >
                <X size={20} />
              </button>
            </header>
            <div className="skill-dialog-content">
              <div className="collection-toolbar">
                <label>
                  {t('说明文档')}{' '}
                  <select
                    aria-label={t('说明文档')}
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                  >
                    <option value="">SKILL.md</option>
                    {selected.references.map((ref) => (
                      <option key={ref.path} value={ref.path}>
                        {ref.path.split('/').at(-1)}
                      </option>
                    ))}
                  </select>
                </label>
                <a className="text-button" href={selected.downloadUrl} download>
                  {t('下载此技能')}
                </a>
              </div>
              <pre className="skill-prompt">{selected.prompt}</pre>
              <div className="skill-markdown">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }) =>
                      href?.startsWith('https://') ? (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ) : (
                        <span>{children}</span>
                      ),
                  }}
                >
                  {document
                    ? selected.references.find((ref) => ref.path === document)
                        ?.content
                    : selected.content}
                </Markdown>
              </div>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}

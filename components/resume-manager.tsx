'use client';
import { RecordBack, useRecordPage } from './record-page';
import { DataMoreActions } from '@/components/data-table';
import { useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  Archive,
  ArchiveRestore,
  Briefcase,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  GraduationCap,
  History,
  Languages,
  Layers,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Target,
  Trophy,
  Wrench,
  X,
} from 'lucide-react';
import { api, download, type Profile } from '@/lib/career';
import {
  resumeKinds,
  resumeLanguageLabels,
  resumeLanguages,
  resumeSections,
  resumeTitle,
  type ResumeEntry,
  type ResumeKind,
  type ResumeLanguage,
} from '@/lib/resume';
import { useLocale } from './locale-provider';

type Verification = ResumeEntry['verification'];
type View = 'all' | Verification | 'archived';

const verificationLabel: Record<Verification, string> = {
  confirmed: '本人已确认',
  pending: '待确认',
  recorded: '已有资料记载',
};
const verificationTone: Record<Verification, string> = {
  confirmed: 'green',
  pending: 'amber',
  recorded: 'gray',
};
const sectionIcon: Record<ResumeKind, typeof Briefcase> = {
  basics: Globe,
  employment: Briefcase,
  education: GraduationCap,
  project: Layers,
  skill: Wrench,
  achievement: Trophy,
  language: Languages,
  preferences: Target,
  document: FileText,
};
const headFields = new Set([
  'name',
  'employer',
  'school',
  'title',
  'role',
  'client',
  'startDate',
  'endDate',
  'degree',
  'major',
  'technologies',
  'location',
  'category',
  'years',
  'level',
  'qualification',
  'date',
  'status',
  'url',
]);
const navKinds = resumeKinds.filter(k => k !== 'basics');
const primaryKinds: ResumeKind[] = ['employment', 'achievement', 'skill', 'document'];
const moreKinds: ResumeKind[] = [];
const sectionLabels: Record<ResumeKind, string> = {
  basics: '概要', employment: '職歴・プロジェクト', education: '基本情報', project: '職歴・プロジェクト',
  skill: 'スキル・語学', achievement: '実績・事例', language: 'スキル・語学', preferences: '基本情報', document: '資料・履歴',
};

/** 把多行文本拆成条目，去掉手写的「1.」「-」等前缀，交给真正的列表渲染。 */
function lines(text = '') {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^(\d+[.、)]|[-•・*])\s*/, ''))
    .filter(Boolean);
}
function chips(text = '') {
  return text
    .split(/[,，、;；|\n]\s*|\s\/\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1 && /^[A-Za-z]/.test(name))
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2);
}

export default function ResumeManager({
  entries,
  profile,
  reload,
}: {
  entries: ResumeEntry[];
  profile: Profile;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useLocale();
  // 界面语言决定展示哪一套简历记录；每种语言各自维护一套。
  const language: ResumeLanguage =
    locale === 'ja' ? 'ja' : locale === 'en' ? 'en' : 'zh';
  const [kind, setKind] = useState<ResumeKind>('employment');
  const [view, setView] = useState<View>('all');
  const [showTools, setShowTools] = useState(false);
  const [draft, setDraft] = useRecordPage<ResumeEntry>('#resume', 'edit', id => entries.find(e => e.id === id) || null, e => e.id);
  const [selected, setSelected] = useRecordPage<ResumeEntry>('#resume', 'view', id => entries.find(e => e.id === id) || null, e => e.id);
  const [historyEntry, setHistoryEntry] = useRecordPage<ResumeEntry>('#resume', 'history', id => entries.find(e => e.id === id) || null, e => e.id);
  const [sourcePage, setSourcePage] = useRecordPage<string>('#resume', 'source', () => 'original', s => s);
  const [history, setHistory] = useState<ResumeEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lang = (e: ResumeEntry) => (e.language || 'ja') === language;
  const active = entries.filter((e) => !e.archived && lang(e));
  const otherLanguages = resumeLanguages
    .filter((l) => l !== language)
    .map((l) => ({
      l,
      n: entries.filter((e) => !e.archived && (e.language || 'ja') === l)
        .length,
    }))
    .filter((x) => x.n);
  const basics = active.find((e) => e.kind === 'basics');
  const records = active.filter((e) => e.kind !== 'basics');
  const counts = (list: ResumeEntry[]) => ({
    confirmed: list.filter((e) => e.verification === 'confirmed').length,
    pending: list.filter((e) => e.verification === 'pending').length,
    recorded: list.filter((e) => e.verification === 'recorded').length,
  });
  const health = counts(records);
  const listed = entries
    .filter(
      (e) =>
        lang(e) &&
        e.kind === kind &&
        (view === 'archived'
          ? e.archived
          : !e.archived && (view === 'all' || e.verification === view)),
    )
    .sort((a, b) =>
      kind === 'skill' || kind === 'language'
        ? (a.data.category || '').localeCompare(b.data.category || '') ||
          (a.data.name || '').localeCompare(b.data.name || '')
        : (b.data.startDate || b.data.date || '').localeCompare(
            a.data.startDate || a.data.date || '',
          ),
    );
  const childrenOf = (id: string) => active.filter((e) => e.parentId === id);
  const parentOf = (entry: ResumeEntry) =>
    entry.parentId ? entries.find((e) => e.id === entry.parentId) : undefined;

  async function save(entry: ResumeEntry) {
    setBusy(true);
    setError('');
    try {
      const { updatedAt, ...payload } = entry;
      void updatedAt;
      await api('resume', payload);
      setDraft(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('保存失败'));
    } finally {
      setBusy(false);
    }
  }
  function start(target: ResumeKind, base?: ResumeEntry) {
    setHistory(null);
    setError('');
    setDraft(
      base
        ? structuredClone(base)
        : {
            id: crypto.randomUUID(),
            revision: 0,
            kind: target,
            language,
            data: {},
            parentId: '',
            sourceNotes: '',
            verification: 'pending',
            archived: false,
            updatedAt: '',
          },
    );
  }
  useEffect(() => {
    if (!historyEntry) return;
    let cancelled = false;
    setHistory(null);
    api<{ entries: ResumeEntry[] }>('resume/history?id=' + encodeURIComponent(historyEntry.id)).then(r => { if (!cancelled) setHistory(r.entries); }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [historyEntry?.id]);
  async function versions(entry: ResumeEntry) {
    setHistoryEntry(entry);
    setError('');
    try {
      const r = await api<{ entries: ResumeEntry[] }>(
        'resume/history?id=' + encodeURIComponent(entry.id),
      );
      setHistory(r.entries);
    } catch (e) {
      setError(String(e));
    }
  }

  const editor = draft && (
    <form
      className="resume-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save(draft);
      }}
    >
      <div className="resume-editor-head">
        <h3>
          {draft.revision ? t('编辑记录') : t('新增记录')} ·{' '}
          {t(resumeSections[draft.kind].label)}
        </h3>
        <button
          type="button"
          className="icon-button"
          aria-label={t('取消')}
          disabled={busy}
          onClick={() => setDraft(null)}
        >
          <X size={17} />
        </button>
      </div>
      <div className="resume-fields">
        {resumeSections[draft.kind].fields.map((f) => (
          <label key={f.key} className={'field' + (f.multiline ? ' wide' : '')}>
            <span>
              {t(f.label)}
              {f.required ? ' *' : ''}
            </span>
            {f.multiline ? (
              <textarea
                required={f.required}
                rows={f.key === 'content' ? 14 : 4}
                value={draft.data[f.key] || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    data: { ...draft.data, [f.key]: e.target.value },
                  })
                }
              />
            ) : (
              <input
                required={f.required}
                type={f.date ? 'month' : 'text'}
                value={draft.data[f.key] || ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    data: { ...draft.data, [f.key]: e.target.value },
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
      <fieldset className="resume-verify">
        <legend>{t('来源与核对')}</legend>
        <div className="resume-fields">
          {['project', 'skill', 'achievement'].includes(draft.kind) && (
            <label className="field">
              <span>{t('关联经历')}</span>
              <select
                value={draft.parentId}
                onChange={(e) =>
                  setDraft({ ...draft, parentId: e.target.value })
                }
              >
                <option value="">{t('无关联')}</option>
                {active
                  .filter(
                    (e) =>
                      e.id !== draft.id &&
                      (e.kind === 'employment' ||
                        (draft.kind !== 'project' && e.kind === 'project')),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {resumeTitle(e)}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t('记录语言')}</span>
            <select
              value={draft.language}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  language: e.target.value as ResumeLanguage,
                })
              }
            >
              {resumeLanguages.map((l) => (
                <option key={l} value={l}>
                  {resumeLanguageLabels[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('确认状态')}</span>
            <select
              value={draft.verification}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  verification: e.target.value as Verification,
                })
              }
            >
              <option value="recorded">{t('已有资料记载')}</option>
              <option value="pending">{t('待确认')}</option>
              <option value="confirmed">{t('本人已确认')}</option>
            </select>
          </label>
          <label className="field wide">
            <span>{t('来源与依据')}</span>
            <textarea
              rows={2}
              value={draft.sourceNotes}
              onChange={(e) =>
                setDraft({ ...draft, sourceNotes: e.target.value })
              }
            />
          </label>
        </div>
      </fieldset>
      <div className="row">
        <button className="primary" disabled={busy}>
          <Check size={16} />
          {busy ? t('保存中') : t('保存记录')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setDraft(null)}
        >
          {t('取消')}
        </button>
      </div>
    </form>
  );

  function actions(entry: ResumeEntry, allowEdit = true) {
    return (
      <div className="resume-actions">
        {allowEdit && entry.kind === 'document' ? (
          <button
            className="icon-button"
            title={t('另存新版本')}
            aria-label={t('另存新版本')}
            disabled={busy}
            onClick={() =>
              start('document', {
                ...entry,
                id: crypto.randomUUID(),
                revision: 0,
                archived: false,
                data: { ...entry.data, version: '' },
              })
            }
          >
            <Copy size={16} />
          </button>
        ) : allowEdit ? (
          <button
            className="icon-button"
            title={t('编辑')}
            aria-label={t('编辑')}
            disabled={busy}
            onClick={() => start(entry.kind, entry)}
          >
            <Pencil size={16} />
          </button>
        ) : null}
        <DataMoreActions label={t('更多')}>
        <button
          className="icon-button"
          title={t('修改历史')}
          aria-label={t('修改历史')}
          disabled={busy}
          onClick={() => void versions(entry)}
        >
          <History size={16} />
        </button>
        <button
          className="icon-button"
          title={entry.archived ? t('恢复') : t('归档')}
          aria-label={entry.archived ? t('恢复') : t('归档')}
          disabled={busy}
          onClick={() => void save({ ...entry, archived: !entry.archived })}
        >
          {entry.archived ? (
            <ArchiveRestore size={16} />
          ) : (
            <Archive size={16} />
          )}
        </button>
        </DataMoreActions>
      </div>
    );
  }

  function footer(entry: ResumeEntry) {
    return (
      <details className="resume-evidence">
        <summary>
          <span className={'badge ' + verificationTone[entry.verification]}>
            {t(verificationLabel[entry.verification])}
          </span>
          <span>
            {t('版本')} {entry.revision}
            {entry.updatedAt ? ' · ' + entry.updatedAt.slice(0, 10) : ''}
          </span>
        </summary>
        <p>{entry.sourceNotes || t('尚未补充来源')}</p>
      </details>
    );
  }

  function extraFields(entry: ResumeEntry) {
    return resumeSections[entry.kind].fields.filter(
      (f) => !headFields.has(f.key) && entry.data[f.key] && !(entry.kind === 'preferences' && f.key === 'roles' && entry.data.role),
    );
  }

  function record(entry: ResumeEntry) {
    const parent = parentOf(entry);
    const kids = childrenOf(entry.id);
    const kidSummary = navKinds
      .map((k) => ({ k, n: kids.filter((e) => e.kind === k).length }))
      .filter((x) => x.n);
    const tech = chips(entry.data.technologies);
    let body: ReactNode = null;
    if (entry.kind === 'document') {
      body = (
        <details className="resume-document">
          <summary>
            {t('查看文档')} · {entry.data.version}
            {entry.data.language ? ' · ' + entry.data.language : ''}
          </summary>
          <div className="resume-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {entry.data.content}
            </ReactMarkdown>
          </div>
          <button
            className="secondary"
            onClick={() =>
              download('resume-' + entry.id + '.md', entry.data.content)
            }
          >
            <Download size={15} />
            {t('下载 Markdown')}
          </button>
        </details>
      );
    } else {
      const fields = extraFields(entry);
      body = fields.length ? (
        <dl className="resume-details">
          {fields.map((f) => {
            const items = lines(entry.data[f.key]);
            return (
              <div key={f.key}>
                <dt>{t(f.label)}</dt>
                <dd>
                  {items.length > 1 ? (
                    <ul>
                      {items.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    entry.data[f.key]
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null;
    }
    const period =
      entry.data.startDate || entry.data.date
        ? entry.data.date ||
          entry.data.startDate +
            ' — ' +
            (entry.data.endDate || t('至今或待确认'))
        : '';
    const subtitle = [
      entry.data.role,
      entry.data.client,
      entry.data.degree,
      entry.data.major,
      entry.data.level,
      entry.data.qualification,
      entry.data.category,
      entry.data.status,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <article
        key={entry.id}
        className={
          'resume-record' + (period || entry.data.years ? '' : ' no-side')
        }
      >
        <div className="resume-record-side">
          {period && <span className="resume-period">{period}</span>}
          {entry.data.years && (
            <span className="resume-period">
              {entry.data.years} {t('年')}
            </span>
          )}
        </div>
        <div className="resume-record-main">
          <div className="resume-record-head">
            <div>
              <h3>{resumeTitle(entry)}</h3>
              {subtitle && <p>{subtitle}</p>}
              {(entry.data.location || entry.data.url) && (
                <p className="resume-record-meta">
                  {entry.data.location && (
                    <span>
                      <MapPin size={13} />
                      {entry.data.location}
                    </span>
                  )}
                  {entry.data.url && (
                    <a href={entry.data.url} target="_blank" rel="noreferrer">
                      <Link2 size={13} />
                      {entry.data.url.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </p>
              )}
            </div>
            {actions(entry, false)}
          </div>
          <div className="resume-record-details">
          {body}
          {!!tech.length && (
            <div className="resume-chips">
              {tech.map((x) => (
                <span key={x} className="tag">
                  {x}
                </span>
              ))}
            </div>
          )}
          {(parent || kidSummary.length > 0) && (
            <div className="resume-links">
              {parent && (
                <button
                  className="text-button"
                  onClick={() => {
                    setKind(parent.kind);
                    setView('all');
                    setDraft(null);
                  }}
                >
                  <Link2 size={13} />
                  {t('关联经历')}：{resumeTitle(parent)}
                </button>
              )}
              {kidSummary.map(({ k, n }) => (
                <button
                  key={k}
                  className="text-button"
                  onClick={() => {
                    setKind(k);
                    setView('all');
                    setDraft(null);
                  }}
                >
                  {n} {t(resumeSections[k].label)}
                </button>
              ))}
            </div>
          )}
          </div>
          {footer(entry)}
        </div>
      </article>
    );
  }

  function chooseKind(next: ResumeKind) {
    setKind(next);
    setView('all');
    setError('');
  }
  const Icon = sectionIcon[kind];

  if (draft) return <section className="panel record-page"><RecordBack onBack={() => setDraft(null)} />{editor}</section>;
  if (historyEntry) return <div className="record-page"><RecordBack onBack={() => setHistoryEntry(null)} />{error && <p role="alert">{error}</p>}
        <section className="panel resume-history">
          <div className="resume-section-head">
            <h2>
              <History size={18} />
              {t('修改历史')}
            </h2>
            <button
              className="icon-button"
              aria-label={t('关闭')}
              onClick={() => setHistoryEntry(null)}
            >
              <X size={17} />
            </button>
          </div>
          {(history || []).map((v) => (
            <details key={v.revision}>
              <summary>
                {resumeTitle(v)} · {t('版本')} {v.revision} · {v.updatedAt}
                {v.archived ? ' · ' + t('已归档') : ''}
              </summary>
              <dl className="resume-details">
                {Object.entries(v.data).map(([k, value]) => (
                  <div key={k}>
                    <dt>
                      {t(
                        resumeSections[v.kind].fields.find((f) => f.key === k)
                          ?.label || k,
                      )}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>{v.sourceNotes}</p>
            </details>
          ))}
        </section></div>;
  if (selected) return <section className="panel record-page"><RecordBack onBack={() => setSelected(null)} />{error && <p role="alert">{error}</p>}{record(entries.find(e => e.id === selected.id) || selected)}</section>;
  if (sourcePage) return <section className="panel record-page"><RecordBack onBack={() => setSourcePage(null)} /><h2>{t('旧版履历原文（保留）')}</h2><ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.experience || profile.summary}</ReactMarkdown></section>;

  return (
    <div className="resume-manager resume-compact">
      <section className="resume-identity" aria-label={t('基本资料')}>
        <div className="resume-avatar" aria-hidden="true">{initials(basics?.data.name) || '?'}</div>
        <div className="resume-identity-text">
          <h2>{basics?.data.name || t('还没有基本资料')}</h2>
          <p>{basics?.data.headline?.split(/[｜|]/)[0].trim() || t('職歴・実績・スキルを管理します。応募先に合わせた書類は「応募書類」で作成します。')}</p>
        </div>
        <div className="resume-identity-actions">
          <button className="text-button" disabled={busy} onClick={() => basics ? setSelected(basics) : start('basics')}>
            <Pencil size={16} />{t('基本资料')}
          </button>
          <DataMoreActions label={t('更多')}>
            <button onClick={() => start('basics', basics)}>{t('编辑基本资料')}</button>
            <button onClick={() => setShowTools(value => !value)}>{t('资料状态与筛选')}</button>
            <button onClick={() => download('resume-data.json', JSON.stringify({ schemaVersion: 1, entries }, null, 2), 'application/json')}>
              <Download size={15} />{t('导出 JSON')}
            </button>
            {(profile.experience || profile.skills) && <button onClick={() => setSourcePage('original')}>{t('旧版履历原文（保留）')}</button>}
          </DataMoreActions>
        </div>
      </section>

      <nav className="resume-category-tabs" aria-label={t('履历分类')}>
        <button aria-current={['basics', 'education', 'preferences'].includes(kind) ? 'page' : undefined} onClick={() => chooseKind('basics')}>{t('概要')}</button>
        {primaryKinds.map(k => <button key={k} aria-current={kind === k ? 'page' : undefined} onClick={() => chooseKind(k)}>{t(sectionLabels[k])}</button>)}
        {moreKinds.length > 0 && <details className="resume-category-more" onKeyDown={event => {
          if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
        }}>
          <summary className={moreKinds.includes(kind) ? 'is-active' : ''}>
            {moreKinds.includes(kind) ? t(resumeSections[kind].label) : t('其他分类')}<ChevronDown size={15} />
          </summary>
          <div className="resume-category-menu">
            {moreKinds.map(k => <button key={k} aria-current={kind === k ? 'page' : undefined} onClick={event => {
              chooseKind(k);
              const menu = event.currentTarget.closest('details');
              if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); }
            }}>{t(resumeSections[k].label)}<span>{active.filter(e => e.kind === k).length}</span></button>)}
          </div>
        </details>}
      </nav>

      {['basics', 'education', 'preferences'].includes(kind) && <nav className="resume-sub-tabs" aria-label={t('基本情報')}>
        {(['basics', 'education', 'preferences'] as ResumeKind[]).map(k => <button key={k} aria-current={kind === k ? 'page' : undefined} onClick={() => chooseKind(k)}>{t(k === 'basics' ? '個人情報' : k === 'education' ? '学歴' : '求職方向')}</button>)}
      </nav>}

      {showTools && <aside className="resume-library-tools" aria-label={t('资料状态与筛选')}>
        <div className="resume-tools-heading"><h3>{t('资料状态与筛选')}</h3><button className="icon-button" aria-label={t('关闭')} onClick={() => setShowTools(false)}><X size={16} /></button></div>
        <p>{resumeLanguageLabels[language]} · {t('本人已确认')} {health.confirmed} · {t('待确认')} {health.pending} · {t('已有资料记载')} {health.recorded}</p>
        <p>{t('生成投递简历时只引用这里的记录；待确认的内容会被标注为未确认事项，投递前请逐条核对。')}</p>
        {otherLanguages.length > 0 && <p>{t('其他语言版本：')}{otherLanguages.map(x => resumeLanguageLabels[x.l] + ' ' + x.n).join(' · ')}{t('，切换界面语言即可查看。')}</p>}
        <label>{t('筛选确认状态')} <select value={view} onChange={event => setView(event.target.value as View)}>
          <option value="all">{t('全部记录')}</option><option value="pending">{t('待确认')}</option><option value="confirmed">{t('本人已确认')}</option><option value="recorded">{t('已有资料记载')}</option><option value="archived">{t('已归档')}</option>
        </select></label>
      </aside>}

      <section className="resume-records" aria-labelledby="resume-records-heading">
        <div className="resume-records-heading">
          <h2 id="resume-records-heading">{t(sectionLabels[kind])}</h2>
          <button className="primary" disabled={busy} onClick={() => start(kind)}><Plus size={18} />{t('添加{0}', [t(resumeSections[kind].label)])}</button>
        </div>
        {view !== 'all' && <div className="resume-active-filter"><span>{view === 'archived' ? t('已归档') : t(verificationLabel[view])}</span><button className="text-button" onClick={() => setView('all')}>{t('清除筛选')}</button></div>}
        {error && <p role="alert" className="resume-error">{error}</p>}
        {!listed.length && <div className="empty"><Icon size={26} /><h3>{view === 'all' ? t('这里还没有记录') : t('没有符合筛选条件的记录')}</h3><p>{view === 'all' ? t('新增一条，或通过 MCP 整理已有资料。') : t('切换筛选条件查看其他记录。')}</p></div>}
        <ul className={'resume-record-list' + (kind === 'preferences' ? ' resume-preference-list' : '')}>
          {listed.flatMap(entry => kind === 'preferences' && (entry.data.role || chips(entry.data.roles)).length > 1
            ? (entry.data.role ? [entry.data.role] : chips(entry.data.roles)).map((role, index) => ({ entry, role, key: entry.id + '-role-' + index }))
            : [{ entry, role: '', key: entry.id }]
          ).map(({ entry, role, key }) => <li key={key}>
            <button className="resume-record-open" onClick={() => setSelected(role ? { ...entry, data: { ...entry.data, role } } : entry)}>
              <span className="resume-record-title">{role || resumeTitle(entry)}</span>
              {(entry.data.role || entry.data.category || entry.data.major || entry.data.level) && <span className="resume-record-subtitle">{entry.data.role || entry.data.category || entry.data.major || entry.data.level}</span>}
              {(entry.data.startDate || entry.data.date) && <span className="resume-record-period">{entry.data.startDate ? [entry.data.startDate, entry.data.endDate || t('至今或待确认')].join(' — ') : entry.data.date}</span>}
              {entry.verification === 'pending' && <span className="resume-record-pending">{t('待确认')}</span>}
            </button>
            <button className="icon-button resume-record-edit" title={t('编辑')} aria-label={t('编辑') + ' ' + (role || resumeTitle(entry))} disabled={busy} onClick={() => start(kind, entry)}><Pencil size={19} /></button>
          </li>)}
        </ul>
      </section>
    </div>
  );
}

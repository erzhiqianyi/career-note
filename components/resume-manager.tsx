'use client';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
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
// 每个分类在生成投递简历时承担的角色，帮助用户理解为什么要维护它。
const sectionHint: Partial<Record<ResumeKind, string>> = {
  employment: '简历的骨架。生成投递简历时按岗位挑选经历并调整表述。',
  education: '学历与课程背景，日文履歴書的必填项。',
  project: '挂在经历下的具体项目，按岗位要求选取最相关的几项。',
  skill: '按分类整理并标注年数，方便与职位要求逐项对照。',
  achievement: '用背景、行动、成果三段记录，志望动机与面试回答的素材。',
  language: '语言能力与资格，决定可投递的岗位范围。',
  preferences: '目标岗位与条件，用于筛选机会和确定简历方向。',
  document: '已生成的完整文档版本，可回看与下载。',
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
const navKinds = resumeKinds.filter((k) => k !== 'basics');

/** 把多行文本拆成条目，去掉手写的「1.」「-」等前缀，交给真正的列表渲染。 */
function lines(text = '') {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^(\d+[.、)]|[-•・*])\s*/, ''))
    .filter(Boolean);
}
function chips(text = '') {
  return text
    .split(/[,，、;；|]\s*|\s\/\s/)
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
  const [draft, setDraft] = useState<ResumeEntry | null>(null);
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
  async function versions(entry: ResumeEntry) {
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

  function actions(entry: ResumeEntry) {
    return (
      <div className="resume-actions">
        {entry.kind === 'document' ? (
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
        ) : (
          <button
            className="icon-button"
            title={t('编辑')}
            aria-label={t('编辑')}
            disabled={busy}
            onClick={() => start(entry.kind, entry)}
          >
            <Pencil size={16} />
          </button>
        )}
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
      (f) => !headFields.has(f.key) && entry.data[f.key],
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
            {actions(entry)}
          </div>
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
          {footer(entry)}
        </div>
      </article>
    );
  }

  const sectionPending = (k: ResumeKind) =>
    active.filter((e) => e.kind === k && e.verification === 'pending').length;
  const Icon = sectionIcon[kind];

  return (
    <div className="resume-manager">
      <section className="panel resume-profile">
        <div className="resume-profile-main">
          <div className="resume-avatar" aria-hidden="true">
            {initials(basics?.data.name) || '?'}
          </div>
          <div className="resume-profile-text">
            <p className="eyebrow">{t('简历资料库')}</p>
            <h2>{basics?.data.name || t('还没有基本资料')}</h2>
            {basics?.data.reading && (
              <p className="resume-reading">{basics.data.reading}</p>
            )}
            <p>{basics?.data.headline || t('按经历积累，按机会选择。')}</p>
            <div className="resume-profile-meta">
              {basics?.data.location && (
                <span>
                  <MapPin size={14} />
                  {basics.data.location}
                </span>
              )}
              {basics?.data.website && (
                <a href={basics.data.website} target="_blank" rel="noreferrer">
                  <Globe size={14} />
                  {basics.data.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {basics?.data.github && (
                <a href={basics.data.github} target="_blank" rel="noreferrer">
                  <Link2 size={14} />
                  {basics.data.github.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>
          <div className="row resume-profile-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => start('basics', basics)}
            >
              <Pencil size={15} />
              {basics ? t('编辑基本资料') : t('填写基本资料')}
            </button>
            <button
              className="secondary"
              onClick={() =>
                download(
                  'resume-data.json',
                  JSON.stringify({ schemaVersion: 1, entries }, null, 2),
                  'application/json',
                )
              }
            >
              <Download size={15} />
              {t('导出 JSON')}
            </button>
          </div>
        </div>
        {basics?.data.summary && (
          <details className="resume-summary">
            <summary>{t('查看职业摘要')}</summary>
            <p>{basics.data.summary}</p>
          </details>
        )}
        {draft?.kind === 'basics' && editor}
        <div className="resume-health">
          <div>
            <span>{t('记录语言')}</span>
            <strong className="is-lang">
              {resumeLanguageLabels[language]}
            </strong>
          </div>
          <div>
            <span>{t('本人已确认')}</span>
            <strong>{health.confirmed}</strong>
          </div>
          <div>
            <span>{t('待确认')}</span>
            <strong className={health.pending ? 'is-pending' : ''}>
              {health.pending}
            </strong>
          </div>
          <div>
            <span>{t('已有资料记载')}</span>
            <strong>{health.recorded}</strong>
          </div>
          <p>
            {t(
              '生成投递简历时只引用这里的记录；待确认的内容会被标注为未确认事项，投递前请逐条核对。',
            )}
            {otherLanguages.length > 0 && (
              <>
                {' '}
                {t('其他语言版本：')}
                {otherLanguages
                  .map((x) => resumeLanguageLabels[x.l] + ' ' + x.n)
                  .join(' · ')}
                {t('，切换界面语言即可查看。')}
              </>
            )}
          </p>
        </div>
      </section>

      <div className="resume-layout">
        <nav className="resume-nav" aria-label={t('履历分类')}>
          {navKinds.map((k) => {
            const KindIcon = sectionIcon[k];
            const n = active.filter((e) => e.kind === k).length;
            const pending = sectionPending(k);
            return (
              <button
                type="button"
                key={k}
                aria-current={kind === k ? 'page' : undefined}
                onClick={() => {
                  setKind(k);
                  setView('all');
                  setDraft(null);
                  setHistory(null);
                  setError('');
                }}
              >
                <KindIcon size={16} />
                <span>{t(resumeSections[k].label)}</span>
                {pending > 0 && (
                  <i className="resume-nav-pending" title={t('待确认')}>
                    {pending}
                  </i>
                )}
                <b className="nav-count">{n}</b>
              </button>
            );
          })}
        </nav>

        <section className="panel resume-section">
          <div className="resume-section-head">
            <div>
              <h2>
                <Icon size={18} />
                {t(resumeSections[kind].label)}
              </h2>
              {sectionHint[kind] && <p>{t(sectionHint[kind]!)}</p>}
            </div>
            <div className="row">
              <select
                aria-label={t('筛选确认状态')}
                value={view}
                onChange={(e) => setView(e.target.value as View)}
              >
                <option value="all">{t('全部记录')}</option>
                <option value="pending">{t('待确认')}</option>
                <option value="confirmed">{t('本人已确认')}</option>
                <option value="recorded">{t('已有资料记载')}</option>
                <option value="archived">{t('已归档')}</option>
              </select>
              <button
                className="primary"
                disabled={busy}
                onClick={() => start(kind)}
              >
                <Plus size={16} />
                {t('新增记录')}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="resume-error">
              {error}
            </p>
          )}
          {draft && draft.kind !== 'basics' && editor}
          {!listed.length && !draft && (
            <div className="empty">
              <Icon size={26} />
              <h3>
                {view === 'all'
                  ? t('这里还没有记录')
                  : t('没有符合筛选条件的记录')}
              </h3>
              <p>
                {view === 'all'
                  ? t('新增一条，或通过 MCP 整理已有资料。')
                  : t('切换筛选条件查看其他记录。')}
              </p>
            </div>
          )}
          {kind === 'skill' || kind === 'language' ? (
            <div className="resume-groups">
              {Array.from(
                listed.reduce((m, e) => {
                  const g = e.data.category || '';
                  m.set(g, [...(m.get(g) || []), e]);
                  return m;
                }, new Map<string, ResumeEntry[]>()),
              ).map(([group, items]) => (
                <section key={group} className="resume-group">
                  {(group || listed.some((e) => e.data.category)) && (
                    <h4>{group || t('未分类')}</h4>
                  )}
                  <ul className="resume-compact">
                    {items.map((entry) => {
                      const parent = parentOf(entry);
                      const detail =
                        entry.data.usage ||
                        [entry.data.level, entry.data.qualification]
                          .filter(Boolean)
                          .join(' · ');
                      return (
                        <li key={entry.id} className="resume-compact-row">
                          <div className="resume-compact-main">
                            <strong>{resumeTitle(entry)}</strong>
                            {detail && <span>{detail}</span>}
                          </div>
                          <span className="resume-compact-meta">
                            {entry.data.years
                              ? entry.data.years + ' ' + t('年')
                              : entry.data.date || ''}
                          </span>
                          <span className="resume-compact-meta resume-compact-link">
                            {parent && (
                              <button
                                className="text-button"
                                onClick={() => {
                                  setKind(parent.kind);
                                  setView('all');
                                  setDraft(null);
                                }}
                              >
                                <Link2 size={12} />
                                {resumeTitle(parent)}
                              </button>
                            )}
                          </span>
                          <span
                            className={
                              'badge ' + verificationTone[entry.verification]
                            }
                            title={entry.sourceNotes || t('尚未补充来源')}
                          >
                            {t(verificationLabel[entry.verification])}
                          </span>
                          {actions(entry)}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="resume-records">{listed.map(record)}</div>
          )}
        </section>
      </div>

      {history && (
        <section className="panel resume-history">
          <div className="resume-section-head">
            <h2>
              <History size={18} />
              {t('修改历史')}
            </h2>
            <button
              className="icon-button"
              aria-label={t('关闭')}
              onClick={() => setHistory(null)}
            >
              <X size={17} />
            </button>
          </div>
          {history.map((v) => (
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
        </section>
      )}
      {(profile.experience || profile.skills) && (
        <details className="panel">
          <summary>{t('旧版履历原文（保留）')}</summary>
          <p>{t('原文保留用于核对；分类记录是当前简历管理入口。')}</p>
          <div className="resume-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {profile.experience || profile.summary}
            </ReactMarkdown>
          </div>
        </details>
      )}
    </div>
  );
}

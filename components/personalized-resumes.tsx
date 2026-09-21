'use client';
import { RecordBack, useRecordPage } from './record-page';
import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Ban, Copy, CopyPlus, ExternalLink, Eye, Pencil, ChevronRight } from 'lucide-react';
import { DataActions, DataCell, DataRow, DataTable, DataTitle } from '@/components/data-table';
import { api } from '@/lib/career';
import { useLocale } from './locale-provider';
import {
  blankResume,
  personalizedResumeSchema,
  resumeFromEntries,
  resumeHTML,
  type PersonalizedResume,
  type ResumePublication,
} from '@/lib/personalized-resume';
import type { ResumeEntry } from '@/lib/resume';

export default function PersonalizedResumes({
  entries = [],
  jobs = [],
}: {
  entries?: ResumeEntry[];
  jobs?: { id: string; company: string; role: string; status: string }[];
}) {
  const { t, locale } = useLocale();
  const resumeLanguage = locale === 'ja' ? 'ja' : locale === 'en' ? 'en' : 'zh';
  const [newFor, setNewFor] = useState('');
  const openJobs = jobs.filter((j) => !['未通过', '已撤回', '内定'].includes(j.status));
  const hasRecords = entries.some((e) => !e.archived && (e.language || 'ja') === resumeLanguage && e.kind !== 'basics');
  const [drafts, setDrafts] = useState<PersonalizedResume[]>([]),
    [publications, setPublications] = useState<ResumePublication[]>([]);
  const [draft, setDraft] = useRecordPage<PersonalizedResume>('#personalized', 'edit', id => id === 'new' ? blankResume() : drafts.find(d => d.id === id) || null, d => d.revision === 0 ? 'new' : d.id);
  const [preview, setPreview] = useRecordPage<PersonalizedResume>('#personalized', 'preview', id => drafts.find(d => d.id === id) || null, d => d.id);
  const [selected, setSelected] = useRecordPage<PersonalizedResume>('#personalized', 'view', id => drafts.find(d => d.id === id) || null, d => d.id);
  const [publication, setPublication] = useRecordPage<ResumePublication>('#personalized', 'publication', id => publications.find(p => p.id === id) || null, p => p.id);
  const [tab, setTab] = useState('drafts'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'unlisted' | 'public'>('unlisted'),
    [expiry, setExpiry] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const refresh = async () => {
    const d = (await api('personalized-resumes')) as {
      drafts: PersonalizedResume[];
      publications: ResumePublication[];
    };
    setDrafts(d.drafts);
    setPublications(d.publications);
  };
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (d: PersonalizedResume) => {
    const { updatedAt, ...payload } = d;
    void updatedAt;
    const saved = (await api(
      'personalized-resumes',
      personalizedResumeSchema.parse(payload),
    )) as PersonalizedResume;
    await refresh();
    setDraft(null);
    setNotice(t('草稿已保存，已有公开链接保持原样。'));
    return saved;
  };
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(t('已复制'));
  };
  const annotateJapanese = (d: PersonalizedResume) => {
    const source = [d.content.name, d.content.headline, d.content.location, d.content.summary,
      ...d.content.sections.flatMap((s) => [s.heading, ...s.items.flatMap((i) => [i.title, i.subtitle, ...i.bullets])])].join(' ');
    const common: Record<string, string> = {
      株式会社カウリス: 'かぶしきがいしゃカウリス', 職務経歴: 'しょくむけいれき', 職務: 'しょくむ', 経歴: 'けいれき',
      開発: 'かいはつ', 設計: 'せっけい', 実装: 'じっそう', 運用: 'うんよう', 保守: 'ほしゅ', 要件: 'ようけん',
      経験: 'けいけん', 技術: 'ぎじゅつ', 業務: 'ぎょうむ', 課題: 'かだい', 改善: 'かいぜん', 導入: 'どうにゅう',
      検証: 'けんしょう', 自動化: 'じどうか', 性能: 'せいのう', 障害対応: 'しょうがいたいおう',
      日本語: 'にほんご', 英語: 'えいご', 中国語: 'ちゅうごくご', 現在: 'げんざい', 東京: 'とうきょう',
      学歴: 'がくれき', 語学: 'ごがく', 個人: 'こじん', プロジェクト: 'プロジェクト',
    };
    return { ...d, content: { ...d.content, readings: Object.fromEntries(Object.entries(common).filter(([word]) => source.includes(word))) } };
  };
  const field = (
    key: 'title' | 'targetRole' | 'targetCompany',
    label: string,
  ) => (
    <label>
      {label}
      <input
        value={draft?.[key] || ''}
        onChange={(e) => setDraft((d) => d && { ...d, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="personalized-manager">
      {!draft && !preview && !selected && !publication && <div className="list-toolbar resume-tabs">
        <div className="toolbar">
          <button onClick={() => setTab('drafts')}>
            {t('简历草稿（{0}）', [drafts.length])}
          </button>
          <button onClick={() => setTab('public')}>
            {t('公开链接（{0}）', [publications.filter(
                (p) =>
                  !p.revokedAt &&
                  (!p.expiresAt || Date.parse(p.expiresAt) > Date.now()),
              ).length])}
          </button>
          <button disabled={busy} onClick={() => act(refresh)}>
            {t('刷新')}
          </button>
        </div>
      </div>
      }
      {error && (
        <p role="alert" className="inline-note">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === 'drafts' && !draft && !preview && !selected && !publication && (
        <>
          <div className="list-toolbar">
            <div className="toolbar">
              {openJobs.length > 0 && (
                <select aria-label={t('目标公司')} value={newFor} onChange={(e) => setNewFor(e.target.value)}>
                  <option value="">{t('不指定公司')}</option>
                  {openJobs.map((j) => <option key={j.id} value={j.id}>{j.company}{j.role ? ' · ' + j.role : ''}</option>)}
                </select>
              )}
              <button className="primary"
                onClick={() => {
                  const job = openJobs.find((j) => j.id === newFor);
                  setDraft(hasRecords ? resumeFromEntries(entries, resumeLanguage, { company: job?.company, role: job?.role }) : blankResume());
                  setPreview(null);
                }}
              >
                {hasRecords ? t('从履历新建') : t('新建简历')}
              </button>
              <button
                onClick={() =>
                  act(() =>
                    copy(
                      '请使用 career-personalized-resume 技能，为我生成个性化简历。先询问目标岗位与语言，读取 Career Note MCP 的 career_get_resume 和 career_get_personalized_resumes，用 career_save_personalized_resume 保存有来源依据的草稿，读回核验。不要发布，不要把内部来源备注写进公开正文。',
                    ),
                  )
                }
              >
                {t('复制 AI 生成请求')}
              </button>
              <label className="resume-import">
                {t('导入 AI 生成的 JSON')}
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void act(async () => {
                        if (f.size > 500000)
                          throw new Error(t('文件不能超过 500 KB'));
                        const raw = JSON.parse(await f.text());
                        delete raw.updatedAt;
                        setDraft(
                          personalizedResumeSchema.parse({
                            ...raw,
                            id: crypto.randomUUID(),
                            revision: 0,
                          }),
                        );
                        setNotice(t('已导入为新草稿，请检查并保存。'));
                      });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          {!drafts.length && (
            <div className="panel">
              {t('还没有个性化简历。新建一份，或让 AI Agent 通过 MCP 保存。')}
            </div>
          )}
          {drafts.length > 0 && (
            <div className="panel dt-panel">
              <DataTable
                label={t('个性化简历')}
                columns={[
                  { key: 'title', label: t('简历 / 目标岗位'), width: 'minmax(0, 1fr)' },
                  { key: 'lang', label: t('语言'), width: '56px' },
                  { key: 'state', label: t('状态'), width: '72px' },
                  { key: 'ops', label: t('操作'), width: '40px', align: 'end' },
                ]}
              >
                {drafts.map((d) => {
                  return (
                    <DataRow key={d.id} className={d.archived ? 'dt-dim' : ''} onOpen={() => setSelected(d)}>
                      <DataTitle title={d.title} meta={`${d.targetRole || t('未填写目标岗位')} · v${d.revision}`} onClick={() => setSelected(d)} />
                      <DataCell label={t('语言')}>{d.language.toUpperCase()}</DataCell>
                      <DataCell label={t('状态')}>
                        <span className={'badge ' + (d.archived ? 'gray' : 'green')}>{d.archived ? t('已归档') : t('草稿')}</span>
                      </DataCell>
                      <DataActions><button className="icon-button" title={t('打开')} aria-label={t('打开') + ' ' + d.title} onClick={() => setSelected(d)}><ChevronRight size={16} /></button></DataActions>
                    </DataRow>
                  );
                })}
              </DataTable>
            </div>
          )}
        </>
      )}
      {selected && (() => { const d = drafts.find(item => item.id === selected.id) || selected; const edit = () => setDraft(structuredClone(d)); return <section className="panel record-page"><RecordBack onBack={() => setSelected(null)} /><h2>{d.title}</h2><p>{d.targetRole} · {d.language.toUpperCase()} · v{d.revision}</p><div className="record-detail-actions">                      <DataActions>
                        <button className="icon-button" onClick={edit} title={t('编辑')} aria-label={t('编辑') + ' ' + d.title}>
                          <Pencil size={16} />
                        </button>

                        <button
                          className="icon-button"
                          title={t('复制为新简历')}
                          aria-label={t('复制为新简历') + ' ' + d.title}
                          onClick={() => {
                            setDraft({
                              ...structuredClone(d),
                              id: crypto.randomUUID(),
                              revision: 0,
                              title: d.title + ' · ' + t('副本'),
                              archived: false,
                            });
                            setPreview(null);
                          }}
                        >
                          <CopyPlus size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title={t('预览与发布')}
                          aria-label={t('预览与发布') + ' ' + d.title}
                          onClick={() => {
                            setPreview(d);
                            setConfirmed(false);
                            setExpiry('');
                          }}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy}
                          title={d.archived ? t('恢复') : t('归档')}
                          aria-label={(d.archived ? t('恢复') : t('归档')) + ' ' + d.title}
                          onClick={() =>
                            act(async () => {
                              await save({ ...d, archived: !d.archived });
                            })
                          }
                        >
                          {d.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>

                      </DataActions></div><iframe title={t('简历详情')} sandbox="" srcDoc={resumeHTML(d.content, d.language)} className="resume-public-preview" /></section>; })()}
      {publication && (() => { const p = publications.find(item => item.id === publication.id) || publication; const active = !p.revokedAt && (!p.expiresAt || Date.parse(p.expiresAt) > Date.now()); return <section className="panel record-page"><RecordBack onBack={() => setPublication(null)} /><h2>{p.title}</h2><p>v{p.draftRevision} · {p.mode === 'public' ? t('允许收录') : t('仅链接访问')}</p><div className="record-detail-actions">                      <DataActions>
                        {active ? (
                          <>
                            <a className="icon-button" href={p.path} target="_blank" rel="noreferrer" title={t('打开本地公开页')} aria-label={t('打开本地公开页') + ' ' + p.title}>
                              <ExternalLink size={16} />
                            </a>
                            <button
                              className="icon-button"
                              title={t('复制本地链接')}
                              aria-label={t('复制本地链接') + ' ' + p.title}
                              onClick={() => act(() => copy(new URL(p.path, window.location.origin).href))}
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              className="icon-button danger"
                              disabled={busy}
                              title={t('撤下链接')}
                              aria-label={t('撤下链接') + ' ' + p.title}
                              onClick={() =>
                                act(async () => {
                                  await api('resume-publications/revoke', { id: p.id });
                                  await refresh();
                                  setNotice(t('链接已撤下。已被他人保存的副本无法收回。'));
                                })
                              }
                            >
                              <Ban size={16} />
                            </button>
                          </>
                        ) : (
                          <span className="icon-button placeholder" aria-hidden />
                        )}
                      </DataActions></div></section>; })()}
      {draft && (
        <form
          className="panel personalized-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await save(draft);
            });
          }}
        >
          <RecordBack onBack={() => setDraft(null)} />
          <h2>{t('编辑简历草稿')}</h2>
          <div className="personalized-fields">
            {field('title', t('管理名称（不公开）'))}
            {field('targetRole', t('目标岗位（不公开）'))}
            {field('targetCompany', t('目标公司（不公开）'))}
            <label>
              {t('简历语言')}
              <select
                value={draft.language}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    language: e.target.value as PersonalizedResume['language'],
                  })
                }
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
          </div>
          <h3>{t('以下内容会出现在公开预览中')}</h3>
          {draft.language === 'ja' && (
            <div className="inline-note">
              <button type="button" onClick={() => setDraft(annotateJapanese(draft))}>
                {t('为已有日语内容标注假名')}
              </button>
              <span>{t('只标注当前词表中可确认的词；后续可替换为 AI 或第三方读音服务。')}</span>
            </div>
          )}
          {(['name', 'headline', 'location', 'summary'] as const).map(
            (k, i) => (
              <label key={k}>
                {t(['姓名', '职业标题', '所在地', '职业摘要'][i])}
                <textarea
                  required={k === 'name'}
                  rows={k === 'summary' ? 4 : 1}
                  value={draft.content[k]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      content: { ...draft.content, [k]: e.target.value },
                    })
                  }
                />
              </label>
            ),
          )}
          <h3>{t('公开联系链接')}</h3>
          {draft.content.links.map((l, i) => (
            <div className="personalized-fields" key={i}>
              <label>
                {t('显示名称')}
                <input
                  value={l.label}
                  required
                  onChange={(e) => {
                    const links = [...draft.content.links];
                    links[i] = { ...l, label: e.target.value };
                    setDraft({
                      ...draft,
                      content: { ...draft.content, links },
                    });
                  }}
                />
              </label>
              <label>
                {t('网址或 mailto 链接')}
                <input
                  value={l.url}
                  required
                  onChange={(e) => {
                    const links = [...draft.content.links];
                    links[i] = { ...l, url: e.target.value };
                    setDraft({
                      ...draft,
                      content: { ...draft.content, links },
                    });
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    content: {
                      ...draft.content,
                      links: draft.content.links.filter((_, n) => n !== i),
                    },
                  })
                }
              >
                {t('移除链接')}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                content: {
                  ...draft.content,
                  links: [...draft.content.links, { label: '', url: '' }],
                },
              })
            }
          >
            {t('添加联系链接')}
          </button>
          {draft.content.sections.map((s, si) => (
            <fieldset key={si}>
              <legend>{t('简历章节')} {si + 1}</legend>
              <label>
                {t('章节标题')}
                <input
                  required
                  value={s.heading}
                  onChange={(e) => {
                    const sections = structuredClone(draft.content.sections);
                    sections[si].heading = e.target.value;
                    setDraft({
                      ...draft,
                      content: { ...draft.content, sections },
                    });
                  }}
                />
              </label>
              {s.items.map((item, ii) => (
                <fieldset key={ii}>
                  <legend>{t('条目')} {ii + 1}</legend>
                  {(['title', 'subtitle', 'period', 'bullets'] as const).map(
                    (k, ki) => (
                      <label key={k}>
                        {t(
                          [
                            '标题',
                            '公司、角色或说明',
                            '时间',
                            '经历要点（每行一项）',
                          ][ki],
                        )}
                        <textarea
                          required={k === 'title'}
                          rows={k === 'bullets' ? 4 : 1}
                          value={
                            k === 'bullets' ? item.bullets.join('\n') : item[k]
                          }
                          onChange={(e) => {
                            const sections = structuredClone(
                              draft.content.sections,
                            );
                            if (k === 'bullets')
                              sections[si].items[ii].bullets =
                                e.target.value.split('\n');
                            else sections[si].items[ii][k] = e.target.value;
                            setDraft({
                              ...draft,
                              content: { ...draft.content, sections },
                            });
                          }}
                        />
                      </label>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const sections = structuredClone(draft.content.sections);
                      sections[si].items.splice(ii, 1);
                      setDraft({
                        ...draft,
                        content: { ...draft.content, sections },
                      });
                    }}
                  >
                    {t('移除条目')}
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                onClick={() => {
                  const sections = structuredClone(draft.content.sections);
                  sections[si].items.push({
                    title: '',
                    subtitle: '',
                    period: '',
                    bullets: [],
                  });
                  setDraft({
                    ...draft,
                    content: { ...draft.content, sections },
                  });
                }}
              >
                {t('添加条目')}
              </button>{' '}
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    content: {
                      ...draft.content,
                      sections: draft.content.sections.filter(
                        (_, i) => i !== si,
                      ),
                    },
                  })
                }
              >
                {t('移除章节')}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                content: {
                  ...draft.content,
                  sections: [
                    ...draft.content.sections,
                    { heading: t('工作经历'), items: [] },
                  ],
                },
              })
            }
          >
            {t('添加章节')}
          </button>
          <label>
            {t('内部备注（不公开）')}
            <textarea
              rows={3}
              value={draft.privateNotes}
              onChange={(e) =>
                setDraft({ ...draft, privateNotes: e.target.value })
              }
            />
          </label>
          <p>{t('关联来源 {0} 条，仅保存在工作区。', [draft.sourceRefs.length])}</p>
          <div className="toolbar">
            <button disabled={busy} type="submit">
              {t('保存草稿')}
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              {t('取消编辑')}
            </button>
          </div>
        </form>
      )}
      {preview && (
        <div className="panel">
          <RecordBack onBack={() => setPreview(null)} />
          <h2>
            {t('发布预览')} · {preview.title} · v{preview.revision}
          </h2>
          <iframe
            title={t('公开简历预览')}
            sandbox=""
            srcDoc={resumeHTML(preview.content, preview.language)}
            className="resume-public-preview"
          />
          <p>
            {t('仅发布上方内容。内部备注、来源、目标公司及工作区数据不公开。修改草稿后需创建新链接；旧链接可单独撤下。')}
          </p>
          <label>
            {t('公开方式')}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="unlisted">{t('仅链接访问 · 请求搜索引擎不收录')}</option>
              <option value="public">{t('公开 · 允许搜索引擎收录')}</option>
            </select>
          </label>
          <p>{t('任何获得链接的人都能查看。仅链接访问不提供密码保护。')}</p>
          <label>
            {t('到期时间（本地时间，留空永久有效）')}
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t('我已检查以上公开内容和联系方式')}
          </label>
          <p>{t('当前服务在本机：创建的链接仅可本地预览，尚未部署到互联网。')}</p>
          <div className="toolbar">
            <button
              disabled={
                busy || !confirmed || preview.archived || preview.revision === 0
              }
              onClick={() =>
                act(async () => {
                  await api('resume-publications', {
                    draftId: preview.id,
                    draftRevision: preview.revision,
                    mode,
                    expiresAt: expiry ? new Date(expiry).toISOString() : '',
                  });
                  await refresh();
                  setPreview(null);
                  setTab('public');
                  setNotice(t('已创建发布快照。本机链接可用于预览。'));
                })
              }
            >
              {t('创建发布快照')}
            </button>
            <button onClick={() => setPreview(null)}>{t('关闭预览')}</button>
          </div>
        </div>
      )}
      {tab === 'public' && !draft && !preview && !selected && !publication && (
        <>
          <div className="inline-note">
            {t('管理每一份简历的公开链接。当前链接在本机运行，互联网发布需要独立的公开服务。归档草稿不会撤下链接。')}
          </div>
          {!publications.length && (
            <div className="panel">
              {t('暂无公开链接。先在草稿中选择「预览与发布」。')}
            </div>
          )}
          {publications.length > 0 && (
            <div className="panel dt-panel">
              <DataTable
                label={t('公开链接')}
                columns={[
                  { key: 'title', label: t('简历'), width: 'minmax(200px, 1.6fr)' },
                  { key: 'mode', label: t('可见性'), width: '92px', hide: 'phone' },
                  { key: 'expires', label: t('有效期'), width: 'minmax(120px, 0.8fr)', hide: 'tablet' },
                  { key: 'state', label: t('状态'), width: '72px' },
                  { key: 'ops', label: t('操作'), width: '108px', align: 'end' },
                ]}
              >
                {publications.map((p) => {
                  const expired = !!p.expiresAt && Date.parse(p.expiresAt) <= Date.now(),
                    active = !p.revokedAt && !expired;
                  return (
                    <DataRow key={p.id} className={active ? '' : 'dt-dim'} onOpen={() => setPublication(p)}>
                      <DataTitle title={p.title} meta={`v${p.draftRevision}`} onClick={() => setPublication(p)} />
                      <DataCell label={t('可见性')} hide="phone">{p.mode === 'public' ? t('允许收录') : t('仅链接访问')}</DataCell>
                      <DataCell label={t('有效期')} hide="tablet" className="num">
                        {p.expiresAt ? new Date(p.expiresAt).toLocaleString() : t('永久有效')}
                      </DataCell>
                      <DataCell label={t('状态')}>
                        <span className={'badge ' + (active ? 'green' : 'gray')}>{p.revokedAt ? t('已撤下') : expired ? t('已过期') : t('有效')}</span>
                      </DataCell>
                      <DataActions><button className="icon-button" aria-label={t('打开') + ' ' + p.title} onClick={() => setPublication(p)}><ChevronRight size={16} /></button></DataActions>
                    </DataRow>
                  );
                })}
              </DataTable>
            </div>
          )}
        </>
      )}
    </section>
  );
}

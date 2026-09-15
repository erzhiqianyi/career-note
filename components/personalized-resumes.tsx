'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/career';
import {
  blankResume,
  personalizedResumeSchema,
  resumeHTML,
  type PersonalizedResume,
  type ResumePublication,
} from '@/lib/personalized-resume';

export default function PersonalizedResumes() {
  const [drafts, setDrafts] = useState<PersonalizedResume[]>([]),
    [publications, setPublications] = useState<ResumePublication[]>([]);
  const [draft, setDraft] = useState<PersonalizedResume | null>(null),
    [preview, setPreview] = useState<PersonalizedResume | null>(null);
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
    setNotice('草稿已保存，已有公开链接保持原样。');
    return saved;
  };
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setNotice('已复制');
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
      <div className="panel">
        <h2>个性化简历</h2>
        <p>
          从履历母版选取经历，交给你使用的 AI Agent
          改写。每份简历独立保存、预览和发布。
        </p>
        <div className="toolbar">
          <button onClick={() => setTab('drafts')}>
            简历草稿（{drafts.length}）
          </button>
          <button onClick={() => setTab('public')}>
            公开链接（
            {
              publications.filter(
                (p) =>
                  !p.revokedAt &&
                  (!p.expiresAt || Date.parse(p.expiresAt) > Date.now()),
              ).length
            }
            ）
          </button>
          <button disabled={busy} onClick={() => act(refresh)}>
            刷新
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="inline-note">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === 'drafts' && (
        <>
          <div className="panel">
            <div className="toolbar">
              <button
                onClick={() => {
                  setDraft(blankResume());
                  setPreview(null);
                }}
              >
                新建简历
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
                复制 AI 生成请求
              </button>
              <label className="resume-import">
                导入 AI 生成的 JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void act(async () => {
                        if (f.size > 500000)
                          throw new Error('文件不能超过 500 KB');
                        const raw = JSON.parse(await f.text());
                        delete raw.updatedAt;
                        setDraft(
                          personalizedResumeSchema.parse({
                            ...raw,
                            id: crypto.randomUUID(),
                            revision: 0,
                          }),
                        );
                        setNotice('已导入为新草稿，请检查并保存。');
                      });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <p>
              技能可在「Agent 协作」下载。导入只创建新草稿；不会覆盖原有版本。
            </p>
          </div>
          {!drafts.length && (
            <div className="panel">
              还没有个性化简历。新建一份，或让 AI Agent 通过 MCP 保存。
            </div>
          )}
          {drafts.map((d) => (
            <article className="panel" key={d.id}>
              <h3>
                {d.title} {d.archived ? '· 已归档' : ''}
              </h3>
              <p>
                {d.targetRole} · {d.language.toUpperCase()} · v{d.revision}
              </p>
              <div className="toolbar">
                <button
                  onClick={() => {
                    setDraft(structuredClone(d));
                    setPreview(null);
                  }}
                >
                  编辑
                </button>
                <button
                  onClick={() => {
                    setDraft({
                      ...structuredClone(d),
                      id: crypto.randomUUID(),
                      revision: 0,
                      title: d.title + ' · 副本',
                      archived: false,
                    });
                    setPreview(null);
                  }}
                >
                  复制为新简历
                </button>
                <button
                  onClick={() => {
                    setPreview(d);
                    setConfirmed(false);
                    setExpiry('');
                  }}
                >
                  预览与发布
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await save({ ...d, archived: !d.archived });
                    })
                  }
                >
                  {d.archived ? '恢复' : '归档'}
                </button>
              </div>
            </article>
          ))}
        </>
      )}
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
          <h2>编辑简历草稿</h2>
          <div className="personalized-fields">
            {field('title', '管理名称（不公开）')}
            {field('targetRole', '目标岗位（不公开）')}
            {field('targetCompany', '目标公司（不公开）')}
            <label>
              简历语言
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
          <h3>以下内容会出现在公开预览中</h3>
          {(['name', 'headline', 'location', 'summary'] as const).map(
            (k, i) => (
              <label key={k}>
                {['姓名', '职业标题', '所在地', '职业摘要'][i]}
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
          <h3>公开联系链接</h3>
          {draft.content.links.map((l, i) => (
            <div className="personalized-fields" key={i}>
              <label>
                显示名称
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
                网址或 mailto 链接
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
                移除链接
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
            添加联系链接
          </button>
          {draft.content.sections.map((s, si) => (
            <fieldset key={si}>
              <legend>简历章节 {si + 1}</legend>
              <label>
                章节标题
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
                  <legend>条目 {ii + 1}</legend>
                  {(['title', 'subtitle', 'period', 'bullets'] as const).map(
                    (k, ki) => (
                      <label key={k}>
                        {
                          [
                            '标题',
                            '公司、角色或说明',
                            '时间',
                            '经历要点（每行一项）',
                          ][ki]
                        }
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
                    移除条目
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
                添加条目
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
                移除章节
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
                    { heading: '工作经历', items: [] },
                  ],
                },
              })
            }
          >
            添加章节
          </button>
          <label>
            内部备注（不公开）
            <textarea
              rows={3}
              value={draft.privateNotes}
              onChange={(e) =>
                setDraft({ ...draft, privateNotes: e.target.value })
              }
            />
          </label>
          <p>关联来源 {draft.sourceRefs.length} 条，仅保存在工作区。</p>
          <div className="toolbar">
            <button disabled={busy} type="submit">
              保存草稿
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              取消编辑
            </button>
          </div>
        </form>
      )}
      {preview && (
        <div className="panel">
          <h2>
            发布预览 · {preview.title} · v{preview.revision}
          </h2>
          <iframe
            title="公开简历预览"
            sandbox=""
            srcDoc={resumeHTML(preview.content, preview.language)}
            className="resume-public-preview"
          />
          <p>
            仅发布上方内容。内部备注、来源、目标公司及工作区数据不公开。修改草稿后需创建新链接；旧链接可单独撤下。
          </p>
          <label>
            公开方式
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="unlisted">仅链接访问 · 请求搜索引擎不收录</option>
              <option value="public">公开 · 允许搜索引擎收录</option>
            </select>
          </label>
          <p>任何获得链接的人都能查看。仅链接访问不提供密码保护。</p>
          <label>
            到期时间（本地时间，留空永久有效）
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
            我已检查以上公开内容和联系方式
          </label>
          <p>当前服务在本机：创建的链接仅可本地预览，尚未部署到互联网。</p>
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
                  setNotice('已创建发布快照。本机链接可用于预览。');
                })
              }
            >
              创建发布快照
            </button>
            <button onClick={() => setPreview(null)}>关闭预览</button>
          </div>
        </div>
      )}
      {tab === 'public' && (
        <>
          <div className="inline-note">
            管理每一份简历的公开链接。当前链接在本机运行，互联网发布需要独立的公开服务。归档草稿不会撤下链接。
          </div>
          {!publications.length && (
            <div className="panel">
              暂无公开链接。先在草稿中选择「预览与发布」。
            </div>
          )}
          {publications.map((p) => {
            const expired =
                !!p.expiresAt && Date.parse(p.expiresAt) <= Date.now(),
              active = !p.revokedAt && !expired;
            return (
              <article className="panel" key={p.id}>
                <h3>
                  {p.title} · v{p.draftRevision}
                </h3>
                <p>
                  {p.revokedAt ? '已撤下' : expired ? '已过期' : '有效'} ·{' '}
                  {p.mode === 'public' ? '允许收录' : '仅链接访问'} ·{' '}
                  {p.expiresAt
                    ? new Date(p.expiresAt).toLocaleString()
                    : '永久有效'}
                </p>
                <div className="toolbar">
                  {active && (
                    <>
                      <a href={p.path} target="_blank" rel="noreferrer">
                        打开本地公开页
                      </a>
                      <button
                        onClick={() =>
                          act(() =>
                            copy(new URL(p.path, window.location.origin).href),
                          )
                        }
                      >
                        复制本地链接
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await api('resume-publications/revoke', {
                              id: p.id,
                            });
                            await refresh();
                            setNotice(
                              '链接已撤下。已被他人保存的副本无法收回。',
                            );
                          })
                        }
                      >
                        撤下链接
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}

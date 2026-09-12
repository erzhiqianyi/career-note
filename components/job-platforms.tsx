'use client';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ExternalLink, Plus, Search, Star, X } from 'lucide-react';
import { api } from '@/lib/career';
import { platformCategories, type JobPlatform } from '@/lib/job-platforms';

type Props = { platforms: JobPlatform[]; reload: () => Promise<void> };
export default function JobPlatforms({ platforms, reload }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('使用中');
  const [category, setCategory] = useState('全部类别');
  const [edit, setEdit] = useState<Partial<JobPlatform> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (edit) dialog.current?.showModal();
  }, [edit]);
  const visible = platforms
    .filter(
      (p) =>
        (filter === '已删除' ? p.deleted : !p.deleted) &&
        (filter !== '使用中' || p.enabled) &&
        (filter !== '已停用' || !p.enabled) &&
        (filter !== '收藏' || p.favorite) &&
        (category === '全部类别' || p.category === category) &&
        `${p.name} ${p.description} ${p.notes}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  async function save(value: Partial<JobPlatform>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('platforms', value);
      setEdit(null);
      await reload();
      setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    await save(
      {
        enabled: true,
        favorite: false,
        deleted: false,
        revision: 0,
        ...edit,
        ...fields,
      },
      '平台已保存',
    );
  }
  return (
    <div className="platforms-page">
      <div className="platform-intro">
        <p>
          选择你想使用的求职入口，记录搜索方向和使用心得。收藏的平台会排在前面。
        </p>
        <button
          className="primary"
          onClick={() => {
            setError('');
            setEdit({});
          }}
        >
          <Plus size={17} />
          添加平台
        </button>
      </div>
      <p className="muted">
        内置平台提供求职入口；具体岗位的日语、经验和在留资格支持仍需逐项确认。这里不会自动采集职位。
      </p>
      <div className="platform-filters">
        <label className="field">
          <span>搜索平台</span>
          <div className="platform-search">
            <Search size={17} />
            <input
              aria-label="搜索平台"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名称、方向或备注"
            />
          </div>
        </label>
        <label className="field">
          <span>类别</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>全部类别</option>
            {platformCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>显示范围</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['使用中', '全部', '收藏', '已停用', '已删除'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {error && !edit && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <output>{notice}</output>}
      <p className="muted">{visible.length} 个平台</p>
      <div className="platform-grid">
        {visible.map((p) => (
          <article
            className="panel platform-card"
            key={p.id}
            aria-label={p.name}
          >
            <div className="section-head">
              <h2>{p.name}</h2>
              <button
                className="icon-button"
                disabled={busy || p.deleted}
                aria-label={`${p.favorite ? '取消收藏' : '收藏'} ${p.name}`}
                aria-pressed={p.favorite}
                onClick={() =>
                  void save(
                    { ...p, favorite: !p.favorite },
                    p.favorite ? '已取消收藏' : '已收藏',
                  )
                }
              >
                <Star size={19} fill={p.favorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="row">
              <span className="badge">{p.category}</span>
              <span className="muted">
                {p.builtin ? '内置' : '自定义'}
                {!p.enabled ? ' · 已停用' : ''}
              </span>
            </div>
            <p>{p.description || '还没有平台说明。'}</p>
            {p.notes && <p className="platform-notes">我的备注：{p.notes}</p>}
            {p.builtin && (
              <details>
                <summary>适用条件与来源</summary>
                <p>{p.cautions}</p>
                <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                  查看内置推荐依据
                </a>
                <p className="muted">
                  来源核验：{p.verifiedAt} · 不代表当前网址或个人备注已经核验
                </p>
              </details>
            )}
            <div className="platform-actions">
              {p.deleted ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void save({ ...p, deleted: false }, '平台已恢复')
                  }
                >
                  恢复平台
                </button>
              ) : (
                <>
                  <a
                    className="platform-open"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    访问平台
                    <ExternalLink size={15} />
                  </a>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setEdit(p);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void save(
                        { ...p, enabled: !p.enabled },
                        p.enabled ? '平台已停用' : '平台已启用',
                      )
                    }
                  >
                    {p.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void save(
                        { ...p, deleted: true },
                        '平台已删除，可在“已删除”中恢复',
                      )
                    }
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="panel empty">
          <h3>没有符合条件的平台</h3>
          <p>试着修改筛选条件，或添加自己的求职入口。</p>
          <button
            onClick={() => {
              setQuery('');
              setFilter('全部');
              setCategory('全部类别');
            }}
          >
            查看全部平台
          </button>
        </div>
      )}
      {edit && (
        <dialog
          ref={dialog}
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setEdit(null);
          }}
          aria-labelledby="platform-dialog-title"
        >
          <div className="modal-head">
            <h2 id="platform-dialog-title">
              {edit.id ? '编辑平台' : '添加平台'}
            </h2>
            <button
              disabled={busy}
              className="icon-button"
              aria-label="关闭平台编辑"
              onClick={() => setEdit(null)}
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <label className="field">
                <span>平台名称 *</span>
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={edit.name}
                />
              </label>
              <label className="field">
                <span>类别</span>
                <select name="category" defaultValue={edit.category || '其他'}>
                  {platformCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field wide">
                <span>平台网址 *</span>
                <input
                  name="url"
                  type="url"
                  required
                  maxLength={2000}
                  placeholder="https://…"
                  defaultValue={edit.url}
                />
              </label>
              <label className="field wide">
                <span>平台说明</span>
                <textarea
                  name="description"
                  rows={3}
                  maxLength={2000}
                  defaultValue={edit.description}
                />
              </label>
              <label className="field wide">
                <span>我的备注</span>
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={5000}
                  placeholder="例如：搜索后端岗位；留意日语要求"
                  defaultValue={edit.notes}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? '保存中…' : '保存平台'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}

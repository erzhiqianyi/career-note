'use client';
import { RecordBack, useRecordPage } from './record-page';
import { useLocale } from '@/components/locale-provider';

import { useState, type SyntheticEvent } from 'react';
import { BriefcaseBusiness, Code2, Globe2, Languages, ArrowUpRight, ExternalLink, Pencil, Plus, Power, RotateCcw, Search, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/career';
import {
  builtinPlatforms,
  platformCategories,
  type JobPlatform,
} from '@/lib/job-platforms';

const categoryIcons: Record<string, typeof Globe2> = {
  'IT・软件工程': Code2,
  '双语・国际业务': Languages,
  '转职中介': BriefcaseBusiness,
};

type Props = { platforms: JobPlatform[]; reload: () => Promise<void> };
export default function JobPlatforms({ platforms, reload }: Props) {
  const { t: tr } = useLocale();
  function platformText(
    platform: JobPlatform,
    field: 'description' | 'cautions',
  ) {
    const value = platform[field];
    const original = builtinPlatforms.find((item) => item.id === platform.id);
    return original?.[field] === value ? tr(value) : value;
  }
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('使用中');
  const [category, setCategory] = useState('全部类别');
  const [edit, setEdit] = useRecordPage<Partial<JobPlatform>>('#platforms', 'edit', id => id === 'new' ? {} : platforms.find(p => p.id === id) || null, p => p.id || 'new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useRecordPage<JobPlatform>('#platforms', 'view', id => platforms.find(p => p.id === id) || null, p => p.id);
  const visible = platforms
    .filter(
      (p) =>
        (filter === '已删除' ? p.deleted : !p.deleted) &&
        (filter !== '使用中' || p.enabled) &&
        (filter !== '已停用' || !p.enabled) &&
        (filter !== '收藏' || p.favorite) &&
        (filter !== '已注册' || p.registered) &&
        (filter !== '未注册' || !p.registered) &&
        (category === '全部类别' || p.category === category) &&
        `${p.name} ${p.description} ${platformText(p, 'description')} ${p.notes} ${p.accountEmail ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const pageCount = Math.max(1, Math.ceil(visible.length / 8));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * 8, currentPage * 8);
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
        // An unchecked checkbox is absent from FormData, so derive it explicitly.
        registered: fields.registered === 'on',
      },
      '平台已保存',
    );
  }
  return (
    <div className="platforms-page">
      {!edit && !selected && <>
      <div className="platform-directory-heading">
        <button className="secondary" onClick={() => { setError(''); setEdit({}); }}><Plus size={17} />{tr('添加平台')}</button>
      </div>
      <div className="list-toolbar platform-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label={tr('搜索平台')}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={tr('名称、方向或备注')}
          />
        </label>
        <select aria-label={tr('类别')} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value={'全部类别'}>{tr('全部类别')}</option>
          {platformCategories.map((c) => (
            <option key={c} value={c}>
              {tr(c)}
            </option>
          ))}
        </select>
        <select aria-label={tr('显示范围')} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          {['使用中', '全部', '收藏', '已注册', '未注册', '已停用', '已删除'].map((c) => (
            <option key={c} value={c}>
              {tr(c)}
            </option>
          ))}
        </select>
        <span className="muted list-count">
          {visible.length}
          {tr('个平台')}
        </span>

      </div>
      {error && !edit && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {notice && <output>{tr(notice)}</output>}
      {visible.length > 0 && (
        <ul className="platform-directory" aria-label={tr('求职平台')}>
          {pageItems.map(p => {
            const CategoryIcon = categoryIcons[p.category] || Globe2;
            return <li key={p.id} className={'platform-directory-row' + (p.deleted || !p.enabled ? ' is-inactive' : '')}>
              <div className="platform-category-mark" data-category={p.category} aria-hidden="true"><CategoryIcon size={23} strokeWidth={1.7} /></div>
              <h3 className="platform-compact-name"><button title={p.name} onClick={() => setSelected(p)}>{p.name}</button></h3>
              {/* Separate grid columns on wider screens; one meta line under the name on phones. */}
              <span className="platform-compact-meta">
                <span className="platform-category-label">{tr(p.category)}</span>
                <span className="platform-compact-status">{tr(p.deleted ? '已删除' : !p.enabled ? '已停用' : p.registered ? '已注册' : '未注册')}</span>
              </span>
              <div className="platform-directory-actions">
                <button className={'icon-button platform-favorite' + (p.favorite ? ' on' : '')} title={tr(p.favorite ? '取消收藏' : '收藏')} aria-label={`${tr(p.favorite ? '取消收藏' : '收藏')} ${p.name}`} aria-pressed={p.favorite} disabled={busy || p.deleted} onClick={() => void save({ ...p, favorite: !p.favorite }, p.favorite ? '已取消收藏' : '已收藏')}><Star size={18} fill={p.favorite ? 'currentColor' : 'none'} /></button>
                <a className="platform-visit" title={tr('访问平台')} href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${tr('访问平台')} ${p.name}`}><ArrowUpRight size={18} /></a>
                <button className="text-button platform-view-details" onClick={() => setSelected(p)} aria-label={`${tr('详情与备注')} ${p.name}`}>{tr('详情')}</button>
              </div>
            </li>;
          })}
        </ul>
      )}
      {visible.length > 8 && <div className="platform-pagination" aria-label={tr('分页')}>
        <span>{tr('第 {0} / {1} 页', [currentPage, pageCount])}</span>
        <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{tr('上一页')}</button>
        <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>{tr('下一页')}</button>
      </div>}
      {!visible.length && (
        <div className="panel empty">
          <h3>{tr('没有符合条件的平台')}</h3>
          <p>{tr('试着修改筛选条件，或添加自己的求职入口。')}</p>
          <button
            onClick={() => {
              setPage(1);
              setQuery('');
              setFilter('全部');
              setCategory('全部类别');
            }}
          >
            {tr('查看全部平台')}
          </button>
        </div>
      )}
      </>}
      {selected && !edit && (() => { const p = platforms.find(item => item.id === selected.id) || selected; return <section className="panel record-page"><RecordBack onBack={() => setSelected(null)} /><h2>{p.name}</h2>
                    <div className="dt-detail">
                      <span className="badge">{p.deleted ? tr('已删除') : p.enabled ? tr('使用中') : tr('已停用')}</span>
                      <div className="record-detail-actions">
                      <button
                        className={'icon-button' + (p.favorite ? ' on' : '')}
                        disabled={busy || p.deleted}
                        title={tr(p.favorite ? '取消收藏' : '收藏')}
                        aria-label={`${tr(p.favorite ? '取消收藏' : '收藏')} ${p.name}`}
                        aria-pressed={p.favorite}
                        onClick={() =>
                          void save({ ...p, favorite: !p.favorite }, p.favorite ? '已取消收藏' : '已收藏')
                        }
                      >
                        <Star size={16} fill={p.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <a className="icon-button" href={p.url} target="_blank" rel="noreferrer" title={tr('访问平台')} aria-label={`${tr('访问平台')} ${p.name}`}>
                        <ExternalLink size={16} />
                      </a>
                      {p.deleted ? (
                        <button
                          className="icon-button phone-hidden"
                          disabled={busy}
                          title={tr('恢复平台')}
                          aria-label={`${tr('恢复平台')} ${p.name}`}
                          onClick={() => void save({ ...p, deleted: false }, '平台已恢复')}
                        >
                          <RotateCcw size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            className="icon-button phone-hidden"
                            disabled={busy}
                            title={tr('编辑')}
                            aria-label={`${tr('编辑')} ${p.name}`}
                            onClick={() => {
                              setError('');
                              setEdit(p);
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button phone-hidden"
                            disabled={busy}
                            title={p.enabled ? tr('停用') : tr('启用')}
                            aria-label={`${p.enabled ? tr('停用') : tr('启用')} ${p.name}`}
                            onClick={() =>
                              void save({ ...p, enabled: !p.enabled }, p.enabled ? '平台已停用' : '平台已启用')
                            }
                          >
                            <Power size={16} />
                          </button>
                          <button
                            className="icon-button danger phone-hidden"
                            disabled={busy}
                            title={tr('删除')}
                            aria-label={`${tr('删除')} ${p.name}`}
                            onClick={() => void save({ ...p, deleted: true }, '平台已删除，可在“已删除”中恢复')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      </div>
                      <p>{platformText(p, 'description') || tr('还没有平台说明。')}</p>
                      <p>{tr(p.registered ? '已注册' : '未注册')}{p.registered && p.accountEmail ? ' · ' + p.accountEmail : ''}</p>
                      {p.notes && (
                        <p className="platform-notes">
                          {tr('我的备注：')}
                          {p.notes}
                        </p>
                      )}
                      {p.builtin && (
                        <>
                          <p>{platformText(p, 'cautions')}</p>
                          <p className="muted">
                            <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                              {tr('查看内置推荐依据')}
                            </a>
                            {' · '}
                            {tr('来源核验：')}
                            {p.verifiedAt}
                            {tr('· 不代表当前网址或个人备注已经核验')}
                          </p>
                        </>
                      )}
                    </div></section>; })()}
      {edit && (
        <section className="panel job-editor-page" aria-labelledby="platform-dialog-title">
          <RecordBack onBack={() => setEdit(null)} />
          <div className="modal-head">
            <h2 id="platform-dialog-title">
              {edit.id ? tr('编辑平台') : tr('添加平台')}
            </h2>
          </div>
          <form onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <label className="field">
                <span>{tr('平台名称 *')}</span>
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={edit.name}
                />
              </label>
              <label className="field">
                <span>{tr('类别')}</span>
                <select name="category" defaultValue={edit.category || '其他'}>
                  {platformCategories.map((c) => (
                    <option key={c} value={c}>
                      {tr(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field wide">
                <span>{tr('平台网址 *')}</span>
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
                <span>{tr('平台说明')}</span>
                <textarea
                  name="description"
                  rows={3}
                  maxLength={2000}
                  defaultValue={edit.description}
                />
              </label>
              <label className="field checkbox">
                <input
                  name="registered"
                  type="checkbox"
                  defaultChecked={edit.registered}
                />
                <span>{tr('已在该平台注册账号')}</span>
              </label>
              <label className="field">
                <span>{tr('登录邮箱')}</span>
                <input
                  name="accountEmail"
                  type="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  defaultValue={edit.accountEmail}
                />
              </label>
              <label className="field wide">
                <span>{tr('我的备注')}</span>
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={5000}
                  placeholder={tr('例如：搜索后端岗位；留意日语要求')}
                  defaultValue={edit.notes}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {tr(error)}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                {tr('取消')}
              </button>
              <button className="primary" disabled={busy}>
                {busy ? tr('保存中…') : tr('保存平台')}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

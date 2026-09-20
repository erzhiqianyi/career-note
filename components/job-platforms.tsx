'use client';
import { RecordBack, useRecordPage } from './record-page';
import { useLocale } from '@/components/locale-provider';

import { Fragment, useState, type SyntheticEvent } from 'react';
import { ChevronDown, ExternalLink, Pencil, Plus, Power, RotateCcw, Search, Star, Trash2 } from 'lucide-react';
import { DataActions, DataCell, DataRow, DataTable, DataTitle } from '@/components/data-table';
import { api } from '@/lib/career';
import {
  builtinPlatforms,
  platformCategories,
  type JobPlatform,
} from '@/lib/job-platforms';

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
      <div className="list-toolbar platform-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label={tr('搜索平台')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('名称、方向或备注')}
          />
        </label>
        <select aria-label={tr('类别')} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value={'全部类别'}>{tr('全部类别')}</option>
          {platformCategories.map((c) => (
            <option key={c} value={c}>
              {tr(c)}
            </option>
          ))}
        </select>
        <select aria-label={tr('显示范围')} value={filter} onChange={(e) => setFilter(e.target.value)}>
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
        <button className="primary" onClick={() => { setError(''); setEdit({}); }}><Plus size={17} />{tr('添加平台')}</button>
      </div>
      {error && !edit && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {notice && <output>{tr(notice)}</output>}
      {visible.length > 0 && (
        <section className="panel dt-panel">
          <DataTable
            label={tr('求职平台')}
            columns={[
              { key: 'name', label: tr('平台'), width: 'minmax(0, 1fr)' },
              { key: 'category', label: tr('类别'), width: '96px', hide: 'phone' },
              { key: 'registered', label: tr('账号'), width: 'minmax(90px, 0.8fr)' },
              { key: 'ops', label: tr('操作'), width: '40px', align: 'end' },
            ]}
          >
            {visible.map((p) => {
              const toggle = () => setSelected(p);
              return (
                <Fragment key={p.id}>
                  <DataRow className={p.deleted || !p.enabled ? 'dt-dim' : ''}>
                    <DataTitle
                      title={<>{p.favorite && <Star size={14} aria-label={tr('收藏')} />} {p.name}</>}
                      meta={new URL(p.url).hostname}
                      onClick={toggle}
                    />
                    <DataCell label={tr('类别')} hide="phone">
                      <span className="badge">{tr(p.category)}</span>
                    </DataCell>
                    <DataCell label={tr('账号')} className="ellipsis" title={p.accountEmail || undefined}>
                      {p.registered ? (
                        <>
                          <span className="badge green">{tr('已注册')}</span>
                          {p.accountEmail && <span className="muted"> {p.accountEmail}</span>}
                        </>
                      ) : (
                        <span className="badge pending">{tr('未注册')}</span>
                      )}
                    </DataCell>
                    <DataActions>
                      <button
                        className="icon-button"
                        title={tr('详情')}
                        aria-label={`${tr('详情')} ${p.name}`}
                        onClick={toggle}
                      >
                        <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
                      </button>
                    </DataActions>
                  </DataRow>

                </Fragment>
              );
            })}
          </DataTable>
        </section>
      )}
      {!visible.length && (
        <div className="panel empty">
          <h3>{tr('没有符合条件的平台')}</h3>
          <p>{tr('试着修改筛选条件，或添加自己的求职入口。')}</p>
          <button
            onClick={() => {
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

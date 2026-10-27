'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, FileText, Link2, Sparkles } from 'lucide-react';
import { api } from '@/lib/career';
import { apiUrl } from '@/lib/api-base';
import { useLocale } from '@/components/locale-provider';

type Category = 'all' | 'start' | 'prepare' | 'connect';
type Article = { slug: string; revision: number; status: 'draft' | 'published'; category: Exclude<Category,'all'>; title: string; summary: string; steps: string[]; body: string; prompt: string; updatedAt: string };
const categories: { id: Category; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'start', label: 'AI 入门' },
  { id: 'prepare', label: '求职准备' }, { id: 'connect', label: '连接工具' },
];
const icons = { start: Sparkles, prepare: FileText, connect: Link2 };
const blank: Article = { slug: '', revision: 0, status: 'draft', category: 'prepare', title: '', summary: '', steps: [''], body: '', prompt: '', updatedAt: '' };

export default function AgentOverview({ canManage = false }: { canManage?: boolean }) {
  const { t } = useLocale();
  const [category, setCategory] = useState<Category>('all');
  const [articles, setArticles] = useState<Article[]>([]);
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [editing, setEditing] = useState<Article | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const publicResult = await api<{ articles: Article[] }>('articles');
      setArticles(publicResult.articles);
      if (canManage) setAllArticles((await api<{ articles: Article[] }>('articles/manage')).articles);
    } catch (error) { setNotice(error instanceof Error ? error.message : '文章读取失败'); }
  }, [canManage]);
  useEffect(() => { void load(); }, [load]);
  const visible = category === 'all' ? articles : articles.filter(article => article.category === category);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    try {
      const saved = await api<Article>('articles/manage', { ...editing, steps: editing.steps.map(step => step.trim()).filter(Boolean) });
      setEditing(saved);
      setNotice('文章已保存');
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存失败'); }
  };
  return <section className="agent-tips" aria-labelledby="agent-tips-title">
    <header className="agent-tips-intro"><div><span className="agent-tips-kicker">{t('AI 求职技巧')}</span><h2 id="agent-tips-title">{t('一起探索 AI 求职的好方法')}</h2><p>{t('从一条问题、一次练习开始。这里收录可直接尝试的方法；即使不连接 Career Note，也能用你常用的 AI 助手试一试。')}</p></div><div className="agent-tips-hero-icon" aria-hidden="true"><Sparkles size={30} /><BriefcaseBusiness size={22} /></div></header>
    <div className="agent-tips-toolbar"><fieldset className="agent-tips-filters" aria-label={t('按主题筛选技巧')}>{categories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{t(item.label)}</button>)}</fieldset><span>{t('手帖精选 · {0} 篇', [visible.length])}</span></div>
    <div className="agent-tips-grid">{visible.map(article => {
      const Icon = icons[article.category];
      return <a className="agent-tip-card" href={apiUrl(`articles/view/${article.slug}`)} key={article.slug}>
        <span className="agent-tip-card-top"><span className="agent-tip-icon"><Icon size={23} aria-hidden="true" /></span><span className="agent-tip-topic">{t(categories.find(item => item.id === article.category)?.label || '')}</span></span>
        <strong>{t(article.title)}</strong><span className="agent-tip-summary">{t(article.summary)}</span><span className="agent-tip-meta"><span className="agent-tip-author">就</span>{t('就职手帖')}<ArrowRight size={16} aria-hidden="true" /></span>
      </a>;
    })}</div>
    {canManage && <div className="agent-article-manage">
      <div className="section-head"><h2>文章管理</h2><button className="secondary" type="button" onClick={() => { setEditing({ ...blank }); setNotice(''); }}>新建文章</button></div>
      <div className="agent-article-manage-list">{allArticles.map(item => <button key={item.slug} type="button" onClick={() => { setEditing({ ...item }); setNotice(''); }}><span>{item.title}</span><small>{item.status === 'published' ? '已发布' : '草稿'} · v{item.revision}</small></button>)}</div>
      {editing && <form onSubmit={event => void save(event)} className="agent-article-form">
        <h3>{editing.revision ? '编辑文章' : '新建文章'}</h3>
        <label>文章地址<input required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editing.slug} disabled={editing.revision > 0} onChange={event => setEditing({ ...editing, slug: event.target.value })} /></label>
        <label>标题<input required maxLength={160} value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label>
        <label>摘要<textarea required maxLength={300} rows={2} value={editing.summary} onChange={event => setEditing({ ...editing, summary: event.target.value })} /></label>
        <label>分类<select value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value as Article['category'] })}><option value="start">AI 入门</option><option value="prepare">求职准备</option><option value="connect">连接工具</option></select></label>
        <label>操作步骤（每行一条）<textarea required rows={5} value={editing.steps.join('\n')} onChange={event => setEditing({ ...editing, steps: event.target.value.split('\n') })} /></label>
        <label>文章正文（段落之间空一行）<textarea rows={9} value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} /></label>
        <label>可复制的提示词<textarea rows={7} value={editing.prompt} onChange={event => setEditing({ ...editing, prompt: event.target.value })} /></label>
        <label>状态<select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value as Article['status'] })}><option value="draft">草稿</option><option value="published">已发布</option></select></label>
        <div className="agent-article-form-actions"><button className="primary" type="submit">保存文章</button><button className="secondary" type="button" onClick={() => setEditing(null)}>关闭</button>{editing.status === 'published' && editing.revision > 0 && <a href={apiUrl(`articles/view/${editing.slug}`)} target="_blank" rel="noopener noreferrer">预览公开页</a>}</div>
      </form>}
      {notice && <p role="status">{notice}</p>}
    </div>}
  </section>;
}

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, Copy, ExternalLink, FileText, Link2, Sparkles } from 'lucide-react';
import { api } from '@/lib/career';
import { apiUrl } from '@/lib/api-base';
import { articleLanguage, articleLocales, articleText, type Article, type ArticleCategory, type ArticleLanguage, type ArticleText } from '@/lib/articles';
import { useLocale } from '@/components/locale-provider';
import { RecordBack, useRecordPage } from '@/components/record-page';

type Category = 'all' | ArticleCategory;
const categories: { id: Category; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'start', label: 'AI 入门' },
  { id: 'prepare', label: '求职准备' }, { id: 'connect', label: '连接工具' },
];
const icons = { start: Sparkles, prepare: FileText, connect: Link2 };
const languageNames: Record<ArticleLanguage, string> = { 'zh-CN': '中文', ja: '日本語', en: 'English' };
const viewUrl = (slug: string, lang: ArticleLanguage) => apiUrl(`articles/view/${slug}`) + (lang === 'zh-CN' ? '' : `?lang=${lang}`);

/** Reads an article inside the app, so the header's back arrow returns to the list without reloading the page. */
function ArticleReader({ article, onBack }: { article: Article; onBack: () => void }) {
  const { t, locale } = useLocale();
  const [copied, setCopied] = useState('');
  const lang = articleLanguage(article, locale);
  const content = articleText(article, lang);
  const copy = async () => {
    try { await navigator.clipboard.writeText(content.prompt); setCopied('已复制提问'); }
    catch { setCopied('复制失败'); }
  };
  return <article className="panel agent-article-reader" lang={lang}>
    <RecordBack onBack={onBack} title={t('AI 求职技巧')} />
    <header>
      <span className="agent-tips-kicker">{t(categories.find(item => item.id === article.category)?.label || '')}{lang !== locale && <span className="agent-tip-lang">{t('仅有中文版')}</span>}</span>
      <h2>{content.title}</h2>
      <p>{content.summary}</p>
    </header>
    <section><h3>{t('操作步骤')}</h3><ol>{content.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>
    {content.body && <section><h3>{t('详细说明')}</h3>{content.body.split(/\n\s*\n/).filter(Boolean).map((part, index) => <p key={index} className="prewrap">{part}</p>)}</section>}
    {content.prompt && <section><h3>{t('可以这样问 AI')}</h3><pre className="agent-article-prompt">{content.prompt}</pre>
      <div className="agent-article-reader-actions"><button type="button" className="primary" onClick={() => void copy()}><Copy size={16} aria-hidden="true" />{t('复制提问')}</button>{copied && <output>{t(copied)}</output>}</div>
    </section>}
    <footer><a href={viewUrl(article.slug, lang)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />{t('打开公开页面（可分享）')}</a></footer>
  </article>;
}

/** Public tips: each card shows the reader's language when the article has that translation, Chinese otherwise. */
export function AgentTips() {
  const { t, locale } = useLocale();
  const [category, setCategory] = useState<Category>('all');
  const [articles, setArticles] = useState<Article[]>([]);
  const [notice, setNotice] = useState('');
  const [reading, setReading] = useRecordPage<Article>('#tips', 'article', slug => articles.find(article => article.slug === slug) || null, article => article.slug);
  useEffect(() => {
    api<{ articles: Article[] }>('articles')
      .then(result => setArticles(result.articles))
      .catch(error => setNotice(error instanceof Error ? error.message : '文章读取失败'));
  }, []);
  const visible = category === 'all' ? articles : articles.filter(article => article.category === category);
  if (reading) return <ArticleReader article={articles.find(article => article.slug === reading.slug) || reading} onBack={() => setReading(null)} />;
  return <section className="agent-tips" aria-labelledby="agent-tips-title">
    <header className="agent-tips-intro"><div><span className="agent-tips-kicker">{t('AI 求职技巧')}</span><h2 id="agent-tips-title">{t('一起探索 AI 求职的好方法')}</h2><p>{t('从一条问题、一次练习开始。这里收录可直接尝试的方法；即使不连接 Career Note，也能用你常用的 AI 助手试一试。')}</p></div><div className="agent-tips-hero-icon" aria-hidden="true"><Sparkles size={30} /><BriefcaseBusiness size={22} /></div></header>
    <div className="agent-tips-toolbar"><fieldset className="agent-tips-filters" aria-label={t('按主题筛选技巧')}>{categories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{t(item.label)}</button>)}</fieldset><span>{t('手帖精选 · {0} 篇', [visible.length])}</span></div>
    <div className="agent-tips-grid">{visible.map(article => {
      const Icon = icons[article.category];
      const lang = articleLanguage(article, locale);
      const content = articleText(article, lang);
      // A plain click reads in place; modified clicks still open the shareable public page.
      return <a className="agent-tip-card" href={viewUrl(article.slug, lang)} key={article.slug} lang={lang} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        setReading(article);
      }}>
        <span className="agent-tip-card-top"><span className="agent-tip-icon"><Icon size={23} aria-hidden="true" /></span><span className="agent-tip-topic">{t(categories.find(item => item.id === article.category)?.label || '')}</span></span>
        <strong>{content.title}</strong><span className="agent-tip-summary">{content.summary}</span>
        <span className="agent-tip-meta"><span className="agent-tip-author">{t('就')}</span>{t('就职手帖')}{lang !== locale && <span className="agent-tip-lang">{t('仅有中文版')}</span>}<ArrowRight size={16} aria-hidden="true" /></span>
      </a>;
    })}</div>
    {notice && <p role="status">{t(notice)}</p>}
  </section>;
}

const blankText: ArticleText = { title: '', summary: '', steps: [''], body: '', prompt: '' };
const blank: Article = { slug: '', revision: 0, status: 'draft', category: 'prepare', ...blankText, translations: {}, updatedAt: '' };

/** Admin-only editor. Chinese is the source; Japanese and English are optional versions of the same article. */
export function ArticleManager() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [editing, setEditing] = useState<Article | null>(null);
  const [lang, setLang] = useState<ArticleLanguage>('zh-CN');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try { setArticles((await api<{ articles: Article[] }>('articles/manage')).articles); }
    catch (error) { setNotice(error instanceof Error ? error.message : '文章读取失败'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = (article: Article) => { setEditing({ ...article, translations: { ...article.translations } }); setLang('zh-CN'); setNotice(''); };
  // The text fields of the tab being edited: the article itself for Chinese, a translation otherwise.
  const current = editing ? (lang === 'zh-CN' ? editing : editing.translations[lang] ?? blankText) : blankText;
  const setText = (patch: Partial<ArticleText>) => setEditing(article => {
    if (!article) return article;
    if (lang === 'zh-CN') return { ...article, ...patch };
    return { ...article, translations: { ...article.translations, [lang]: { ...(article.translations[lang] ?? blankText), ...patch } } };
  });
  const removeTranslation = () => setEditing(article => {
    if (!article || lang === 'zh-CN') return article;
    const translations = { ...article.translations };
    delete translations[lang];
    return { ...article, translations };
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const clean = (text: ArticleText): ArticleText => ({ ...text, steps: text.steps.map(step => step.trim()).filter(Boolean) });
    const translations = Object.fromEntries(Object.entries(editing.translations).map(([code, text]) => [code, clean(text)]));
    try {
      const saved = await api<Article>('articles/manage', { ...editing, ...clean(editing), translations });
      setEditing(saved);
      setNotice('文章已保存');
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存失败'); }
  };
  const isSource = lang === 'zh-CN';
  return <section className="agent-article-manage" aria-labelledby="article-manage-title">
    <div className="section-head"><h2 id="article-manage-title">文章管理</h2><button className="secondary" type="button" onClick={() => open({ ...blank })}>新建文章</button></div>
    <div className="agent-article-manage-list">{articles.map(item => <button key={item.slug} type="button" aria-pressed={editing?.slug === item.slug} onClick={() => open(item)}>
      <span>{item.title}</span>
      <small>{item.status === 'published' ? '已发布' : '草稿'} · v{item.revision} · {['中', ...articleLocales.map(code => item.translations[code] ? (code === 'ja' ? '日' : 'EN') : '')].filter(Boolean).join(' / ')}</small>
    </button>)}</div>
    {editing && <form onSubmit={event => void save(event)} className="agent-article-form">
      <h3>{editing.revision ? '编辑文章' : '新建文章'}</h3>
      <div className="agent-article-shared">
        <label>文章地址<input required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editing.slug} disabled={editing.revision > 0} onChange={event => setEditing({ ...editing, slug: event.target.value })} /></label>
        <label>分类<select value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value as ArticleCategory })}><option value="start">AI 入门</option><option value="prepare">求职准备</option><option value="connect">连接工具</option></select></label>
        <label>状态<select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value as Article['status'] })}><option value="draft">草稿</option><option value="published">已发布</option></select></label>
      </div>
      <div className="agent-article-langs" role="tablist" aria-label="语言版本">{(['zh-CN', ...articleLocales] as ArticleLanguage[]).map(code => <button key={code} type="button" role="tab" aria-selected={lang === code} onClick={() => setLang(code)}>
        {languageNames[code]}{code === 'zh-CN' ? '（原文）' : editing.translations[code] ? '' : '（未翻译）'}
      </button>)}</div>
      {!isSource && <p className="small muted">未填写的语言版本会显示中文原文。翻译需填写标题、摘要和至少一条步骤；全部留空即不提供该语言。</p>}
      <div role="tabpanel" className="agent-article-text" lang={lang}>
        <label>标题<input required={isSource} maxLength={160} placeholder={isSource ? '' : editing.title} value={current.title} onChange={event => setText({ title: event.target.value })} /></label>
        <label>摘要<textarea required={isSource} maxLength={300} rows={2} placeholder={isSource ? '' : editing.summary} value={current.summary} onChange={event => setText({ summary: event.target.value })} /></label>
        <label>操作步骤（每行一条）<textarea required={isSource} rows={5} placeholder={isSource ? '' : editing.steps.join('\n')} value={current.steps.join('\n')} onChange={event => setText({ steps: event.target.value.split('\n') })} /></label>
        <label>文章正文（段落之间空一行）<textarea rows={9} value={current.body} onChange={event => setText({ body: event.target.value })} /></label>
        <label>可复制的提示词<textarea rows={7} value={current.prompt} onChange={event => setText({ prompt: event.target.value })} /></label>
      </div>
      <div className="agent-article-form-actions">
        <button className="primary" type="submit">保存文章</button>
        <button className="secondary" type="button" onClick={() => setEditing(null)}>关闭</button>
        {!isSource && editing.translations[lang] && <button className="secondary" type="button" onClick={removeTranslation}>移除{languageNames[lang]}版本</button>}
        {editing.status === 'published' && editing.revision > 0 && <a href={viewUrl(editing.slug, isSource || editing.translations[lang] ? lang : 'zh-CN')} target="_blank" rel="noopener noreferrer">预览公开页</a>}
      </div>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

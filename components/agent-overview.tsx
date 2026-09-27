'use client';

import { useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Check, Clipboard, FileText, Link2, MessagesSquare, Search, Sparkles } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';

type Category = 'all' | 'start' | 'prepare' | 'connect';
const categories: { id: Category; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'start', label: 'AI 入门' },
  { id: 'prepare', label: '求职准备' },
  { id: 'connect', label: '连接工具' },
];
const tips = [
  {
    id: 'first-chat', category: 'start', icon: Sparkles,
    title: '第一次用 AI 求职，从这里开始',
    summary: '不用安装工具。先让 AI 问你几个问题，再把模糊的求职想法整理成下一步。',
    steps: [
      '只告诉 AI 与求职有关的经历、目标岗位和希望工作的地区；不必先整理成完整简历。',
      '让它先提问，补齐职位方向、语言能力、工作条件等关键空白。',
      '请它给出本周最值得做的三件事，并指出哪些建议仍需要你核实。',
    ],
    prompt: '我准备在日本找工作，但还不确定从哪里开始。请先问我最多 5 个关键问题，了解我的经历、目标岗位、日语水平和工作条件。等我回答后，再给出本周可以完成的 3 个具体步骤；不要猜测我没有提供的事实。',
  },
  {
    id: 'job-post', category: 'prepare', icon: Search,
    title: '读懂一条招聘信息',
    summary: '让 AI 帮你区分硬性要求、加分条件和没有写清楚的地方。',
    steps: [
      '提供招聘原始链接或正文，并说明你最在意的条件。',
      '请 AI 分开列出明示要求、推测和需要向公司确认的问题。',
      '回到招聘原文检查日期、工作地点、薪资、语言与在留资格信息。',
    ],
    prompt: '请阅读这条招聘信息：[粘贴链接或正文]。分三栏列出明确写出的要求、可能的加分条件、尚不清楚的问题。对日语、地点、薪资和在留资格不要自行补全；引用对应原文，并告诉我信息的确认日期。',
  },
  {
    id: 'resume', category: 'prepare', icon: FileText,
    title: '把经历改写成有依据的履历',
    summary: '让 AI 帮你找出经历与岗位的连接点，同时守住真实事实。',
    steps: [
      '提供现有履历和目标职位，先请 AI 标记匹配点与信息缺口。',
      '逐条核对公司、项目、职责、成果和数字是否确实属于你。',
      '让 AI 再写一版草稿；把无法确认的内容留作待填写。',
    ],
    prompt: '这是我的现有履历：[粘贴相关经历]。这是目标职位：[粘贴职位要求]。请先做事实对照表，再给出一版针对该岗位的履历表述。不得编造业绩数字、学历或职责；不确定的地方请标为“待确认”。',
  },
  {
    id: 'interview', category: 'prepare', icon: MessagesSquare,
    title: '把面试练习变成有效复盘',
    summary: '先自己回答，再请 AI 从内容、结构和日语表达三个角度给建议。',
    steps: [
      '请 AI 根据岗位生成少量练习题，并标明这些只是模拟题。',
      '先用自己的话回答；保存原回答，不让 AI 代替你回答。',
      '请它指出缺少的事实、回答结构和日语表达问题，然后再练一次。',
    ],
    prompt: '请根据这个岗位：[粘贴职位信息]，给我 5 道日语模拟面试题。一次只问一题，等我回答后再点评。点评请分为内容依据、结构、日语表达，并给一个可练习的修改方向。不要把模拟题称作公司真题。',
  },
  {
    id: 'connect', category: 'connect', icon: Link2,
    title: '让 AI 读取 Career Note 的资料',
    summary: '如果你已经在手帖保存履历和职位，可以连接 MCP，减少反复复制资料。',
    steps: [
      '先核对手帖里的履历和求职条件，再选择你正在使用的 AI 助手。',
      '按照连接向导添加 MCP 地址，在浏览器里选择权限并完成授权。',
      '先让助手读取工作区约定和资料；写入前预览，写入后到手帖核对。',
    ],
    prompt: '请调用 Career Note 的 career_get_contract，先告诉我这个工作区的使用约定。然后读取我的履历概况，列出可用于求职准备的资料和明显缺口；这一步先不要写入任何内容。',
  },
] as const;

export default function AgentOverview({ onAdd }: { onAdd: () => void }) {
  const { t } = useLocale();
  const [category, setCategory] = useState<Category>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const selected = tips.find((tip) => tip.id === selectedId);
  const visible = category === 'all' ? tips : tips.filter((tip) => tip.category === category);
  const copyPrompt = async (id: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(t(prompt));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 2000);
    } catch {
      setCopiedId(null);
    }
  };
  return (
    <section className="agent-tips" aria-labelledby="agent-tips-title">
      <header className="agent-tips-intro">
        <div>
          <span className="agent-tips-kicker">{t('AI 求职技巧')}</span>
          <h2 id="agent-tips-title">{t('一起探索 AI 求职的好方法')}</h2>
          <p>{t('从一条问题、一次练习开始。这里收录可直接尝试的方法；即使不连接 Career Note，也能用你常用的 AI 助手试一试。')}</p>
        </div>
        <div className="agent-tips-hero-icon" aria-hidden="true"><Sparkles size={30} /><BriefcaseBusiness size={22} /></div>
      </header>
      <div className="agent-tips-toolbar">
        <fieldset className="agent-tips-filters" aria-label={t('按主题筛选技巧')}>
          {categories.map((item) => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setSelectedId(null); }}>{t(item.label)}</button>)}
        </fieldset>
        <span>{t('手帖精选 · {0} 篇', [visible.length])}</span>
      </div>
      <div className="agent-tips-grid">
        {visible.map((tip) => {
          const Icon = tip.icon;
          return <button className="agent-tip-card" key={tip.id} type="button" aria-expanded={selectedId === tip.id} onClick={() => setSelectedId(selectedId === tip.id ? null : tip.id)}>
            <span className="agent-tip-card-top"><span className="agent-tip-icon"><Icon size={23} aria-hidden="true" /></span><span className="agent-tip-topic">{t(categories.find((item) => item.id === tip.category)?.label || '')}</span></span>
            <strong>{t(tip.title)}</strong>
            <span className="agent-tip-summary">{t(tip.summary)}</span>
            <span className="agent-tip-meta"><span className="agent-tip-author">就</span>{t('就职手帖')}<ArrowRight size={16} aria-hidden="true" /></span>
          </button>;
        })}
      </div>
      {selected && <article className="agent-tip-detail" aria-live="polite">
        <div className="agent-tip-detail-head"><div><span>{t('就职手帖 · 实用技巧')}</span><h3>{t(selected.title)}</h3></div><button type="button" className="text-button" onClick={() => setSelectedId(null)}>{t('收起')}</button></div>
        <ol>{selected.steps.map((step) => <li key={step}>{t(step)}</li>)}</ol>
        <div className="agent-tip-prompt"><b>{t('可以这样问 AI')}</b><p>{t(selected.prompt)}</p><button type="button" className="secondary" onClick={() => void copyPrompt(selected.id, selected.prompt)}>{copiedId === selected.id ? <Check size={16} /> : <Clipboard size={16} />}{t(copiedId === selected.id ? '已复制提问' : '复制提问')}</button></div>
        {selected.id === 'connect' && <button type="button" className="primary" onClick={onAdd}>{t('查看连接步骤')} <ArrowRight size={16} /></button>}
      </article>}
    </section>
  );
}

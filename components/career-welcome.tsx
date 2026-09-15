'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowRight, BriefcaseBusiness, FileText, MessageCircle, Check, BookOpen } from 'lucide-react';
import { LanguageSwitcher, useLocale } from '@/components/locale-provider';

type Props = {
  ready: boolean;
  configured: boolean;
  busy: boolean;
  error: string;
  userEmail: string;
  onLogin: () => void;
  onLogout: () => void;
};
const features = [
  { title: '找到值得投入的机会', short: '公司与机会', icon: BriefcaseBusiness, description: '把职位、匹配点和待确认事项放在一起，知道下一步该做什么。' },
  { title: '准备有针对性的材料', short: '求职材料', icon: FileText, description: '围绕每家公司整理履历、志望动机与经历证据，保留可核对的版本。' },
  { title: '把想法练成面试回答', short: '面试练习', icon: MessageCircle, description: '从构思到日语表达，记录回答、复盘不足，再练一次。' },
];

export default function CareerWelcome({ ready, configured, busy, error, userEmail, onLogin, onLogout }: Props) {
  const { t } = useLocale();
  const [active, setActive] = useState(0);
  const preview = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const showExample = () => {
    preview.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    tabs.current[active]?.focus({ preventScroll: true });
  };
  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <a href="#" className="welcome-brand" aria-label={t('就职手帖')}><span>{t('就')}</span><div>{t('就职手帖')}<small>CAREER NOTE</small></div></a>
        <LanguageSwitcher />
      </header>
      <main className="welcome-main">
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-intro">
            <p className="welcome-kicker">{t('为在日本工作的下一步')}</p>
            <h1 id="welcome-title">{t('让每一次求职准备，')}<br /><em>{t('都有迹可循。')}</em></h1>
            <p className="welcome-description">{t('从发现心仪公司，到写好一份材料、练好一次面试。把零散的信息，整理成每天可以推进的一步。')}</p>
            <div className="welcome-actions">
              <button className="primary welcome-signin" disabled={!ready || !configured || busy} onClick={onLogin} aria-busy={busy}>
                <span className="welcome-google" aria-hidden="true">G</span>{t(busy ? '正在登录…' : '使用 Google 登录')}<ArrowRight size={17} aria-hidden="true" />
              </button>
              <button className="welcome-example-link" onClick={showExample}>{t('先看看功能示例')}<ArrowDown size={16} aria-hidden="true" /></button>
            </div>
            <div className="welcome-auth-state" aria-live="polite">
              {error && <p role="alert">{t(error)}</p>}
              {!ready && <p>{t(error ? '请检查服务后刷新页面。' : '正在读取登录配置…')}</p>}
              {ready && !configured && <p>{t('Google 登录暂未就绪，请联系工作区管理者。')}</p>}
              {userEmail && <button className="text-button" disabled={busy} onClick={onLogout}>{t('退出并切换账号')} · {userEmail}</button>}
            </div>
          </div>
          <section className="welcome-preview" ref={preview} aria-label={t('功能示例')}>
            <div className="welcome-preview-top"><span><BookOpen size={16} aria-hidden="true" />{t('手帖一页')}</span><small>{t('虚构示例 · 无需登录')}</small></div>
            <div className="welcome-tabs" role="tablist" aria-label={t('功能示例')}>
              {features.map((feature, i) => <button key={feature.short} ref={el => { tabs.current[i] = el; }} type="button" role="tab" id={`welcome-tab-${i}`} aria-selected={active === i} aria-controls="welcome-example-panel" tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)} onKeyDown={event => {
                let next = i;
                if (event.key === 'ArrowRight') next = (i + 1) % features.length;
                else if (event.key === 'ArrowLeft') next = (i + features.length - 1) % features.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = features.length - 1;
                else return;
                event.preventDefault(); setActive(next); tabs.current[next]?.focus();
              }}>{t(feature.short)}</button>)}
            </div>
            <div className="welcome-example" id="welcome-example-panel" role="tabpanel" aria-labelledby={`welcome-tab-${active}`} tabIndex={0}>
              {active === 0 && <>
                <p className="welcome-note-label">01 / {t('从一家公司开始')}</p>
                <h2>{t('青空科技（虚构）')}</h2><p className="welcome-example-sub">{t('后端工程师 · 东京')}</p>
                <div className="welcome-note"><span>{t('为什么值得关注')}</span><p>{t('岗位重视 API 设计与团队协作，可以结合自己的项目经历准备。')}</p></div>
                <div className="welcome-note"><span>{t('还需要确认')}</span><p>{t('日语沟通场景、远程办公安排与选考流程。')}</p></div>
                <div className="welcome-next"><Check size={17} aria-hidden="true" /><div><small>{t('下一步')}</small><p>{t('整理一个能说明技术取舍的项目故事')}</p></div></div>
              </>}
              {active === 1 && <>
                <p className="welcome-note-label">02 / {t('让材料回应岗位')}</p>
                <h2>{t('一份志望动机的提纲')}</h2><p className="welcome-example-sub">{t('青空科技（虚构） · 准备草稿')}</p>
                <ol className="welcome-outline"><li><strong>{t('为什么是这家公司')}</strong><p>{t('从业务与岗位出发，写下真正感兴趣的部分。')}</p></li><li><strong>{t('我能带来什么')}</strong><p>{t('选择一段真实经历，用行动与结果支撑。')}</p></li><li><strong>{t('希望如何成长')}</strong><p>{t('把个人方向与团队需要连接起来。')}</p></li></ol>
                <p className="welcome-example-foot">{t('材料与公司关联，修改后仍可回看历史版本。')}</p>
              </>}
              {active === 2 && <>
                <p className="welcome-note-label">03 / {t('把经历说清楚')}</p>
                <h2>{t('练习一段项目介绍')}</h2><p className="welcome-question" lang="ja">これまでのプロジェクトで、工夫した点を教えてください。</p>
                <div className="welcome-note"><span>{t('先整理思路')}</span><p>{t('遇到了什么问题？为什么这样做？结果如何？')}</p></div>
                <div className="welcome-note"><span>{t('再练习表达')}</span><p>{t('用日语组织回答，保存后回看，补充具体事例。')}</p></div>
                <p className="welcome-example-foot">{t('先构思，再用日语练习回答。')}</p>
              </>}
            </div>
            <div className="welcome-preview-bottom"><span>{t('示例仅用于了解功能，不会写入你的资料。')}</span><span aria-hidden="true">0{active + 1} / 03</span></div>
          </section>
        </section>
        <section className="welcome-features" aria-label={t('从机会到面试')}>
          {features.map(({ title, icon: Icon, description }, i) => <article key={title}><span className="welcome-feature-number"><Icon size={19} aria-hidden="true" /><small>0{i + 1}</small></span><h2>{t(title)}</h2><p>{t(description)}</p></article>)}
        </section>
        <section className="welcome-faq" aria-label={t('使用前了解')}>
          <details><summary>{t('登录后，怎么开始？')}</summary><p>{t('先整理个人履历与求职方向，再添加一家公司，准备材料并练习面试。也可以让你的 AI 助手协助研究，将核对后的结果导入手帖。')}</p></details>
          <details><summary>{t('谁可以登录？资料会公开吗？')}</summary><p>{t('使用 Google 账号即可登录，首次登录会获得独立的工作区。每位用户只能管理自己的求职资料；未登录访客只能查看功能示例。')}</p></details>
          <details><summary>{t('会自动生成材料或替我投递吗？')}</summary><p>{t('网页负责整理与练习，研究和材料草稿由你使用的 AI 助手协作完成。内容需自行核对，申请也由你决定并发送。')}</p></details>
        </section>
      </main>
      <footer className="welcome-footer"><span>CAREER NOTE</span><p>{t('一歩ずつ、前へ。')}</p><span>{t('你的准备，按自己的节奏。')}</span></footer>
    </div>
  );
}

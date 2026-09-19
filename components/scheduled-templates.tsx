'use client';
import { useState } from 'react';
import { Copy, LayoutTemplate } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import {
  scheduledTaskTemplates,
  type ScheduledTaskTemplate,
} from '@/lib/scheduled-templates';

const triggerLabel: Record<ScheduledTaskTemplate['trigger'], string> = {
  cron: '定时',
  event: '事件驱动',
  'cron+event': '定时轮询待办',
};
const environmentLabel: Record<ScheduledTaskTemplate['environment'], string> = {
  local: '仅本机',
  any: '云端或本机',
};

export default function ScheduledTemplates() {
  const { t } = useLocale();
  const [notice, setNotice] = useState('');
  return (
    <section className="panel scheduled-templates">
      <div className="section-head">
        <h2>
          <LayoutTemplate size={19} /> {t('定时任务模板')}
        </h2>
        <span className="tag">{t('参考')}</span>
      </div>
      <p>
        {t(
          '一个任务只做一种事：收集、核对、处理待办、汇总、复盘分开设置，失败互不影响，无变化各自保持安静。复制后按自己的来源、时刻和助手调整，再手动试跑一次。',
        )}
      </p>
      <ol className="template-list">
        {scheduledTaskTemplates.map((template) => (
          <li key={template.id} className="template-card">
            <div className="template-head">
              <b>{t(template.title)}</b>
              <span className="template-meta">
                <span className="tag">{t(triggerLabel[template.trigger])}</span>
                <span className="tag">{t(environmentLabel[template.environment])}</span>
                <span className="tag">{template.cadence}</span>
              </span>
            </div>
            <p className="small">{t(template.summary)}</p>
            <p className="small page-note">
              {t('技能')}：{template.skill} · {t('写入')}：{template.writes}
            </p>
            <details>
              <summary>{t('查看任务指令')}</summary>
              <div className="schedule-preview">
                <textarea
                  aria-label={t('{0} 的任务指令', [t(template.title)])}
                  rows={14}
                  readOnly
                  value={template.prompt}
                />
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(template.prompt);
                      setNotice('已复制定时任务指令');
                    } catch {
                      setNotice('复制失败，请手动复制。');
                    }
                  }}
                >
                  <Copy size={15} />
                  {t('复制定时任务指令')}
                </button>
              </div>
            </details>
          </li>
        ))}
      </ol>
      <p className="small page-note">
        {t(
          '建议顺序：收集 07:00 → 邮件核对 07:30 → 每日分析 08:00；待办处理独立轮询。站内收集要用已登录的浏览器，只能在本机运行；云端任务不能访问 localhost。',
        )}
      </p>
      <output aria-live="polite">{t(notice)}</output>
    </section>
  );
}

'use client';
import { RecordBack, useRecordPage } from './record-page';
import ScheduledSync from './scheduled-sync';
import { DataTable, DataRow, DataTitle, DataCell, DataActions } from './data-table';
import { useState } from 'react';
import { Copy, LayoutTemplate, ChevronRight } from 'lucide-react';
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

export default function ScheduledTemplates() {
  const { t } = useLocale();
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useRecordPage<ScheduledTaskTemplate>('#schedule', 'template', id => scheduledTaskTemplates.find(t => t.id === id) || null, t => t.id);
  const [config, setConfig] = useRecordPage<boolean>('#schedule', 'config', () => true, () => 'new');
  if (config) return <div className="record-page"><RecordBack onBack={() => setConfig(null)} /><ScheduledSync /></div>;
  if (selected) return <section className="panel record-page"><RecordBack onBack={() => setSelected(null)} /><h2>{t(selected.title)}</h2><p>{t(selected.summary)}</p><div className="schedule-preview"><textarea aria-label={t('{0} 的任务指令', [t(selected.title)])} rows={20} readOnly value={selected.prompt} /><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(selected.prompt); setNotice('已复制定时任务指令'); } catch { setNotice('复制失败，请手动复制。'); } }}><Copy size={15} />{t('复制定时任务指令')}</button></div><output>{t(notice)}</output></section>;

  return (
    <section className="panel scheduled-templates">
      <div className="section-head">
        <h2>
          <LayoutTemplate size={19} /> {t('定时任务模板')}
        </h2>
        <span className="tag">{t('参考')}</span>
      </div>
      <button className="secondary" onClick={() => setConfig(true)}>{t('定时收集配置')}</button>
      <DataTable label={t('定时任务模板')} columns={[
        {key:'title',label:t('标题'),width:'minmax(0, 1fr)'},
        {key:'trigger',label:t('类型'),width:'100px'},
        {key:'open',label:t('操作'),width:'40px',align:'end'},
      ]}>{scheduledTaskTemplates.map(template => <DataRow key={template.id} onOpen={() => setSelected(template)}>
        <DataTitle title={t(template.title)} meta={t(template.summary)} onClick={() => setSelected(template)} />
        <DataCell corner>{t(triggerLabel[template.trigger])}</DataCell>
        <DataActions openOnly><button className="icon-button" title={t('打开')} aria-label={t('打开')} onClick={() => setSelected(template)}><ChevronRight size={16} /></button></DataActions>
      </DataRow>)}</DataTable>
      <output aria-live="polite">{t(notice)}</output>
    </section>
  );
}

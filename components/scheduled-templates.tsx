'use client';
import { RecordBack, useRecordPage } from './record-page';
import ScheduledSync from './scheduled-sync';
import {
  DataTable,
  DataRow,
  DataTitle,
  DataCell,
  DataActions,
} from './data-table';
import { useState } from 'react';
import { Copy, LayoutTemplate, ChevronRight } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import {
  scheduledTaskTemplates,
  type ScheduledTaskTemplate,
} from '@/lib/scheduled-templates';
import {
  buildConfiguredTask,
  defaultTaskConfiguration,
  taskGuides,
  type TaskConfiguration,
} from '@/lib/scheduled-task-config';

const triggerLabel: Record<ScheduledTaskTemplate['trigger'], string> = {
  cron: '定时',
  event: '事件驱动',
  'cron+event': '定时轮询待办',
};

function TemplateConfiguration({
  template,
  onBack,
}: {
  template: ScheduledTaskTemplate;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const guide = taskGuides[template.id];
  const [value, setValue] = useState(() => defaultTaskConfiguration(template));
  const [preview, setPreview] = useState('');
  const [notice, setNotice] = useState('');
  const update = (change: Partial<TaskConfiguration>) => {
    setValue((current) => ({ ...current, ...change }));
    setPreview('');
    setNotice('');
  };
  return (
    <section className="panel record-page scheduled-templates">
      <RecordBack onBack={onBack} />
      <h2>{t(template.title)}</h2>
      <p>{t(template.summary)}</p>
      <p className="page-note">
        {t(
          '系统仅提供模板与数据接口。请使用自己的 AI Agent 完成分析、资料生成和定时调度。',
        )}
      </p>
      <dl className="facts">
        <div>
          <dt>{t('所需输入')}</dt>
          <dd>{t(guide.inputs)}</dd>
        </div>
        <div>
          <dt>{t('运行条件')}</dt>
          <dd>{t(guide.prerequisites)}</dd>
        </div>
        <div>
          <dt>{t('预期成果')}</dt>
          <dd>{t(guide.outcomes)}</dd>
        </div>
        <div>
          <dt>{t('验收标准')}</dt>
          <dd>{t(guide.checks)}</dd>
        </div>
      </dl>
      <h3>{t('如何使用')}</h3>
      <ol className="template-usage">
        <li>{t('填写执行计划和输入范围，生成完整任务指令。')}</li>
        <li>
          {t(
            '将指令交给自己的 Agent，连接 Career Note MCP，并授权所需的邮件或网站访问。',
          )}
        </li>
        <li>
          {t(
            '让 Agent 先试跑并核对成果，再在它自己的系统中创建定时任务，返回任务 ID、启用状态和下次运行时间。',
          )}
        </li>
        <li>
          {t(
            '在 Career Note 查看写回的资料与报告；任务的修改、暂停和运行记录在自己的 Agent 中管理。',
          )}
        </li>
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            setPreview(buildConfiguredTask(template, value));
            setNotice('');
          } catch (error) {
            setNotice(error instanceof Error ? error.message : '配置无效');
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            <span>{t('执行计划')}</span>
            <input
              required
              maxLength={300}
              value={value.cadence}
              onChange={(e) => update({ cadence: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('时区')}</span>
            <select
              value={value.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
            >
              <option>Asia/Tokyo</option>
              <option>Asia/Shanghai</option>
              <option>UTC</option>
            </select>
          </label>
          {guide.sourceRequired && (
            <>
              <label className="field wide">
                <span>{t('来源与账号范围')}</span>
                <textarea
                  required
                  rows={3}
                  maxLength={4000}
                  placeholder={t(
                    '填写平台账号别名与页面，或邮箱账号别名、文件夹和筛选条件；不要填写密码或令牌。',
                  )}
                  value={value.source}
                  onChange={(e) => update({ source: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t('每次回看天数')}</span>
                <input
                  type="number"
                  required
                  min={1}
                  max={90}
                  value={value.days}
                  onChange={(e) => update({ days: Number(e.target.value) })}
                />
              </label>
            </>
          )}
          {template.id === 'practice-analysis' && (
            <label className="field">
              <span>{t('练习分析天数')}</span>
              <input
                type="number"
                required
                min={1}
                max={90}
                value={value.days}
                onChange={(e) => update({ days: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="field wide">
            <span>
              {t(
                template.id === 'practice-analysis'
                  ? '分析重点'
                  : template.id === 'status-followup'
                    ? '跟进重点'
                    : '补充筛选条件',
              )}
            </span>
            <textarea
              rows={3}
              maxLength={4000}
              placeholder={t(
                template.id === 'practice-analysis'
                  ? '例如：自我介绍、经历说明、回答结构或日语表达；留空按默认维度分析。'
                  : template.id === 'status-followup'
                    ? '例如：关注面试日程、补交资料期限和逾期跟进；留空核对全部已有岗位。'
                    : '可补充目标岗位、地区、硬性条件、偏好与排除项；留空沿用已有求职条件。',
              )}
              value={value.conditions}
              onChange={(e) => update({ conditions: e.target.value })}
            />
          </label>
          {template.id === 'invitation-prep' && (
            <>
              <label className="field">
                <span>{t('每轮推荐岗位上限')}</span>
                <input
                  type="number"
                  required
                  min={1}
                  max={20}
                  value={value.recommendationLimit}
                  onChange={(e) =>
                    update({ recommendationLimit: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span>{t('资料准备策略')}</span>
                <select
                  value={value.preparation}
                  onChange={(e) =>
                    update({
                      preparation: e.target
                        .value as TaskConfiguration['preparation'],
                    })
                  }
                >
                  <option value="recommend-only">{t('仅筛选推荐')}</option>
                  <option value="existing-tasks">
                    {t('仅处理本人已有准备待办')}
                  </option>
                  <option value="top-matches">
                    {t('自动为优先匹配岗位准备草稿')}
                  </option>
                </select>
              </label>
              {value.preparation !== 'recommend-only' && (
                <label className="field">
                  <span>{t('每轮准备岗位上限')}</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={5}
                    value={value.preparationLimit}
                    onChange={(e) =>
                      update({ preparationLimit: Number(e.target.value) })
                    }
                  />
                </label>
              )}
              <p className="small field wide">
                {t(
                  '仅推荐时生成推荐报告与岗位记录；选择准备后才生成五类材料和模拟题组。关键硬性条件未知时先列待确认。',
                )}
              </p>
            </>
          )}
        </div>
        <button className="secondary" type="submit">
          {t('生成任务指令')}
        </button>
      </form>
      {preview && (
        <div className="schedule-preview">
          <p className="small page-note">
            {t('先在助手中试跑，再创建任务。复制成功不代表已启用。')}
          </p>
          <textarea
            aria-label={t('定时任务指令')}
            rows={20}
            readOnly
            value={preview}
          />
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(preview);
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
      )}
      <output aria-live="polite">{t(notice)}</output>
    </section>
  );
}

export default function ScheduledTemplates() {
  const { t } = useLocale();
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useRecordPage<ScheduledTaskTemplate>(
    '#schedule',
    'template',
    (id) => scheduledTaskTemplates.find((t) => t.id === id) || null,
    (t) => t.id,
  );
  const [config, setConfig] = useRecordPage<boolean>(
    '#schedule',
    'config',
    () => true,
    () => 'new',
  );
  if (config)
    return (
      <div className="record-page">
        <RecordBack onBack={() => setConfig(null)} />
        <ScheduledSync />
      </div>
    );
  if (selected)
    return (
      <TemplateConfiguration
        key={selected.id}
        template={selected}
        onBack={() => setSelected(null)}
      />
    );

  const renderTemplates = (
    templates: ScheduledTaskTemplate[],
    label: string,
  ) => (
    <DataTable
      label={t(label)}
      columns={[
        { key: 'title', label: t('标题'), width: 'minmax(0, 1fr)' },
        { key: 'trigger', label: t('类型'), width: '100px' },
        { key: 'open', label: t('操作'), width: '40px', align: 'end' },
      ]}
    >
      {templates.map((template) => (
        <DataRow key={template.id} onOpen={() => setSelected(template)}>
          <DataTitle
            title={t(template.title)}
            meta={t(template.summary)}
            onClick={() => setSelected(template)}
          />
          <DataCell corner>{t(triggerLabel[template.trigger])}</DataCell>
          <DataActions openOnly>
            <button
              className="icon-button"
              title={t('打开')}
              aria-label={t('打开')}
              onClick={() => setSelected(template)}
            >
              <ChevronRight size={16} />
            </button>
          </DataActions>
        </DataRow>
      ))}
    </DataTable>
  );

  return (
    <section className="panel scheduled-templates">
      <div className="section-head">
        <h2>
          <LayoutTemplate size={19} /> {t('定时任务模板')}
        </h2>
        <span className="tag">{t('由自己的 Agent 执行')}</span>
      </div>
      <p>
        {t(
          '系统仅提供模板与数据接口。请使用自己的 AI Agent 完成分析、资料生成和定时调度。',
        )}
      </p>
      <p className="small">
        {t(
          '选择模板，查看所需输入、预期成果和验收标准，再配置并复制任务指令。',
        )}
      </p>
      <button className="secondary" onClick={() => setConfig(true)}>
        {t('定时收集配置')}
      </button>
      <h3>{t('三类常用任务')}</h3>
      {renderTemplates(
        scheduledTaskTemplates.filter((template) => template.recommended),
        '三类常用任务',
      )}
      <details>
        <summary>{t('更多专项模板')}</summary>
        <p className="small">
          {t(
            '专项模板用于拆分执行；请避免与常用任务重复处理同一批资料或回答。',
          )}
        </p>
        {renderTemplates(
          scheduledTaskTemplates.filter((template) => !template.recommended),
          '更多专项模板',
        )}
      </details>
      <output aria-live="polite">{t(notice)}</output>
    </section>
  );
}

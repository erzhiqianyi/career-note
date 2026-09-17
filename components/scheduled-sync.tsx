'use client';
import { useState } from 'react';
import { Copy, CalendarClock } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import { buildSyncSchedule, type SyncSchedule } from '@/lib/scheduled-sync';
export default function ScheduledSync() {
  const { t } = useLocale();
  const [value, setValue] = useState<SyncSchedule>({
    source: '',
    scope: 'status',
    cadence: 'daily',
    time: '09:00',
    timezone: 'Asia/Tokyo',
    days: 7,
  });
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState('');
  function update(change: Partial<SyncSchedule>) {
    setValue({ ...value, ...change });
    setPreview('');
    setNotice('');
  }
  return (
    <section className="panel scheduled-sync">
      <div className="section-head">
        <h2>
          <CalendarClock size={19} /> {t('定时收集配置')}
        </h2>
        <span className="tag">{t('尚未启用')}</span>
      </div>
      <p>
        {t(
          '设置来源与频率，生成交给助手的任务指令。网页不会自行抓取或启动定时任务。',
        )}
      </p>
      <details>
        <summary>{t('配置来源与执行时间')}</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setPreview(buildSyncSchedule(value));
              setNotice('');
            } catch (error) {
              setNotice(error instanceof Error ? error.message : '配置无效');
            }
          }}
        >
          <div className="form-grid">
            <label className="field wide">
              <span>{t('来源与账号范围')}</span>
              <textarea
                required
                maxLength={4000}
                rows={3}
                placeholder={t(
                  '填写平台账号别名与页面，或邮箱账号别名、文件夹和筛选条件；不要填写密码或令牌。',
                )}
                value={value.source}
                onChange={(e) => update({ source: e.target.value })}
              />
            </label>
            <label className="field">
              <span>{t('收集内容')}</span>
              <select
                value={value.scope}
                onChange={(e) =>
                  update({ scope: e.target.value as SyncSchedule['scope'] })
                }
              >
                <option value="status">{t('投递动态')}</option>
                <option value="profile">{t('简历版本变化')}</option>
                <option value="both">{t('简历与投递动态')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('执行频率')}</span>
              <select
                value={value.cadence}
                onChange={(e) =>
                  update({ cadence: e.target.value as SyncSchedule['cadence'] })
                }
              >
                <option value="daily">{t('每天')}</option>
                <option value="weekdays">{t('工作日')}</option>
                <option value="weekly">{t('每周一')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('执行时间')}</span>
              <input
                required
                type="time"
                value={value.time}
                onChange={(e) => update({ time: e.target.value })}
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
            <label className="field">
              <span>{t('每次回看天数')}</span>
              <input
                required
                type="number"
                min={1}
                max={90}
                value={value.days}
                onChange={(e) => update({ days: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="small">
            {t(
              '当前保存核对报告，投递状态由你确认后更新。无变化保持安静；新增、失败或待确认时通知。',
            )}
          </p>
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
              rows={12}
              readOnly
              value={preview}
            />
            <button
              className="text-button"
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
      </details>
    </section>
  );
}

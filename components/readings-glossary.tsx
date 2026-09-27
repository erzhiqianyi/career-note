'use client';
import { useState } from 'react';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/career';
import { alignReading, type ReadingEntry } from '@/lib/japanese-readings';
import { useLocale } from '@/components/locale-provider';

const AGENT_PROMPT =
  '使用 career-japanese-readings 技能：读取 Career Note 中我的面试题、回答点评、公司与招聘信息、准备资料里的日语，为其中的汉字词补充学习用假名，保存为待确认建议。不要为人名、公司名、地名猜读音。';

/** The study furigana glossary: add, correct, confirm agent suggestions and remove words. */
export default function ReadingsGlossary({ entries, onChanged }: { entries: ReadingEntry[]; onChanged: () => Promise<void> | void }) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<'all' | 'pending'>(entries.some((e) => !e.confirmed) ? 'pending' : 'all');
  const [query, setQuery] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [word, setWord] = useState('');
  const [reading, setReading] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = entries.filter((e) => !e.confirmed).length;
  const shown = entries.filter((e) => (filter === 'all' || !e.confirmed) && (!query || e.word.includes(query) || e.reading.includes(query)));
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      await onChanged();
      setMessage(done);
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = (list: Array<{ word: string; reading: string }>, done = '已保存') =>
    run(() => api('readings', { entries: list.map((e) => ({ ...e, confirmed: true })) }), done);
  return (
    <div className="readings-glossary">
      <div className="readings-head">
        <div>
          <h3>{t('假名词表')}</h3>
          <p>{t('面试练习、公司资料、准备文稿和简历预览里的日语，按这张词表标注假名。AI 建议的读音以虚线显示，确认后变为实线。')}</p>
        </div>
        <button type="button" className="secondary" onClick={() => void navigator.clipboard.writeText(AGENT_PROMPT).then(() => setMessage('已复制'))}>
          <Copy size={15} />
          {t('复制给 AI Agent 的指令')}
        </button>
      </div>
      <form
        className="readings-add"
        onSubmit={(e) => {
          e.preventDefault();
          void save([{ word: word.trim(), reading: reading.trim() }]).then((ok) => { if (ok) { setWord(''); setReading(''); } });
        }}
      >
        <input aria-label={t('词语')} placeholder={t('词语（含汉字）')} value={word} onChange={(e) => setWord(e.target.value)} lang="ja" maxLength={32} required />
        <input aria-label={t('读音')} placeholder={t('读音（假名）')} value={reading} onChange={(e) => setReading(e.target.value)} lang="ja" maxLength={64} required />
        <button className="secondary" disabled={busy}><Plus size={15} />{t('添加')}</button>
      </form>
      <div className="readings-toolbar">
        <fieldset className="readings-filter" aria-label={t('筛选')}>
          <button type="button" aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>{t('待确认 {0}', [String(pending)])}</button>
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('全部 {0}', [String(entries.length)])}</button>
        </fieldset>
        <input type="search" aria-label={t('搜索词表')} placeholder={t('搜索')} value={query} onChange={(e) => setQuery(e.target.value)} lang="ja" />
        {filter === 'pending' && shown.length > 0 && (
          <button type="button" className="secondary" disabled={busy} onClick={() => void save(shown.map((e) => ({ word: e.word, reading: edits[e.word] ?? e.reading })), '已确认')}>
            <Check size={15} />{t('全部确认')}
          </button>
        )}
      </div>
      {message && <output className="small readings-message">{t(message)}</output>}
      {shown.length ? (
        <ul className="readings-list">
          {shown.map((e) => {
            const value = edits[e.word] ?? e.reading;
            const changed = value !== e.reading;
            return (
              <li key={e.word} className={e.confirmed ? '' : 'is-unconfirmed'}>
                <span className="readings-word" lang="ja">
                  {alignReading(e.word, value || e.reading).map((p, i) => (p.reading ? <ruby key={i}>{p.text}<rt>{p.reading}</rt></ruby> : p.text))}
                </span>
                <input aria-label={t('{0} 的读音', [e.word])} value={value} lang="ja" maxLength={64} onChange={(ev) => setEdits((m) => ({ ...m, [e.word]: ev.target.value }))} />
                <small className="muted">{t(e.source === 'agent' ? 'AI 建议' : '自己添加')}{e.note ? ' · ' + e.note : ''}</small>
                <span className="readings-actions">
                  {(changed || !e.confirmed) && (
                    <button type="button" className="icon-button" disabled={busy || !value.trim()} title={t('确认读音')} aria-label={t('确认读音')} onClick={() => void save([{ word: e.word, reading: value.trim() }], '已确认')}>
                      <Check size={15} />
                    </button>
                  )}
                  <button type="button" className="icon-button" disabled={busy} title={t('删除')} aria-label={t('删除')} onClick={() => void run(() => api('readings', { remove: [e.word] }), '已删除')}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">{t(entries.length ? '没有符合条件的词。' : '词表还是空的。自己添加，或把上面的指令交给 AI Agent 生成建议。')}</p>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Save, Sparkles, Trash2, X } from 'lucide-react';
import { api, type Attempt, type Question } from '@/lib/career';
import { MAX_ORDER_NAME, MAX_QUESTION_ORDERS, moveQuestionAfter, unfamiliarFirst, type QuestionOrders } from '@/lib/question-order';
import { Ja } from '@/components/japanese-text';
import { useLocale } from '@/components/locale-provider';

const newOrderId = () => 'order-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * Picks and edits the saved practice orders of one question set. `questions` is the list as currently
 * shown (already in the active order); saving only stores question ids, so Q numbers, answers and
 * reviews stay with their questions.
 */
export function QuestionOrderBar({ packId, questions, saved, attempts, reviewedAttemptIds, reload, title }: {
  packId: string;
  questions: Question[];
  saved: QuestionOrders | undefined;
  attempts: Attempt[];
  reviewedAttemptIds: Set<string>;
  reload: () => Promise<void>;
  title: (q: Question) => string;
}) {
  const { t: tr } = useLocale();
  const orders = saved?.orders || [];
  const active = orders.find(o => o.id === saved?.activeOrderId);
  const [editing, setEditing] = useState<{ id: string | null; name: string; ids: string[] } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const known = new Set(questions.map(q => q.id));

  async function save(nextOrders: QuestionOrders['orders'], activeOrderId: string | null) {
    setBusy(true); setMessage('');
    try {
      // Drop ids of questions removed from the set since the order was saved.
      const clean = nextOrders.map(o => ({ ...o, questionIds: o.questionIds.filter(id => known.has(id)) }));
      await api('question-orders', { questionSetId: packId, revision: saved?.revision ?? 0, activeOrderId, orders: clean });
      await reload();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败');
      return false;
    } finally { setBusy(false); }
  }
  function startEditing(fromActive: boolean) {
    setMessage('');
    setEditing({ id: fromActive && active ? active.id : null, name: fromActive && active ? active.name : '', ids: questions.map(q => q.id) });
  }
  async function commit(asNew: boolean) {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { setMessage('请给这个顺序起个名字'); return; }
    if (orders.some(o => o.name === name && (asNew || o.id !== editing.id))) { setMessage('已有同名顺序'); return; }
    const id = asNew || !editing.id ? newOrderId() : editing.id;
    if (id !== editing.id && orders.length >= MAX_QUESTION_ORDERS) { setMessage(tr('最多保存 {0} 个顺序', [String(MAX_QUESTION_ORDERS)])); return; }
    const order = { id, name, questionIds: editing.ids };
    const next = orders.some(o => o.id === id) ? orders.map(o => o.id === id ? order : o) : [...orders, order];
    if (await save(next, id)) setEditing(null);
  }
  async function remove() {
    if (!editing?.id) return;
    if (await save(orders.filter(o => o.id !== editing.id), saved?.activeOrderId === editing.id ? null : saved?.activeOrderId ?? null)) setEditing(null);
  }
  const move = (id: string, delta: number) => setEditing(e => {
    if (!e) return e;
    const i = e.ids.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= e.ids.length) return e;
    const ids = [...e.ids];
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return { ...e, ids };
  });
  const byId = new Map(questions.map(q => [q.id, q]));
  const label = (q: Question) => (q.questionNumber ? 'Q' + q.questionNumber + ' · ' : '') + title(q);

  return <div className="question-order">
    <div className="question-order-bar">
      <label>
        <ListOrdered size={16} aria-hidden="true" />
        <span className="sr-only">{tr('练习顺序')}</span>
        <select value={saved?.activeOrderId || ''} disabled={busy || !!editing}
          aria-label={tr('练习顺序')}
          onChange={e => void save(orders, e.target.value || null)}>
          <option value="">{tr('面试流程（默认）')}</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      {!editing && <button type="button" className="text-button" disabled={busy} onClick={() => startEditing(true)}>{tr('调整顺序')}</button>}
    </div>
    {message && !editing && <p role="alert" className="small">{tr(message)}</p>}
    {editing && <section className="question-order-editor" aria-label={tr('调整顺序')}>
      <p className="muted small">{tr('拖动或用箭头调整顺序；只改变练习顺序，Q 编号、回答和点评都会保留。')}</p>
      <div className="question-order-tools">
        <input value={editing.name} maxLength={MAX_ORDER_NAME} placeholder={tr('顺序名称，例如：重点强化')}
          aria-label={tr('顺序名称')} onChange={e => setEditing({ ...editing, name: e.target.value })} />
        <button type="button" className="secondary" disabled={busy}
          title={tr('未练习 → 未点评 → 点评次数少的问题依次提前')}
          onClick={() => setEditing({ ...editing, ids: unfamiliarFirst(editing.ids, packId, attempts, reviewedAttemptIds) })}>
          <Sparkles size={15} />{tr('未熟练优先')}
        </button>
      </div>
      <ol className="question-order-list">
        {editing.ids.map((id, index) => {
          const q = byId.get(id);
          if (!q) return null;
          return <li key={id} draggable
            className={dragging === id ? 'is-dragging' : ''}
            onDragStart={e => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
            onDragEnd={() => setDragging(null)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={e => {
              e.preventDefault();
              const moving = dragging || e.dataTransfer.getData('text/plain');
              if (!moving || moving === id) return;
              // Dropping on the upper half places the question before this one, otherwise after it.
              const rect = e.currentTarget.getBoundingClientRect();
              const before = e.clientY < rect.top + rect.height / 2;
              const rest = editing.ids.filter(x => x !== moving);
              const after = before ? (rest[rest.indexOf(id) - 1] ?? null) : id;
              setEditing({ ...editing, ids: moveQuestionAfter(editing.ids, moving, after) });
              setDragging(null);
            }}>
            <GripVertical size={16} className="question-order-grip" aria-hidden="true" />
            <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="question-order-title"><Ja text={label(q)} /></span>
            <button type="button" className="icon-button" aria-label={tr('上移')} disabled={index === 0} onClick={() => move(id, -1)}><ArrowUp size={15} /></button>
            <button type="button" className="icon-button" aria-label={tr('下移')} disabled={index === editing.ids.length - 1} onClick={() => move(id, 1)}><ArrowDown size={15} /></button>
          </li>;
        })}
      </ol>
      {message && <p role="alert" className="small">{tr(message)}</p>}
      <div className="question-order-actions">
        {editing.id && <button type="button" className="primary" disabled={busy} onClick={() => void commit(false)}><Save size={15} />{tr('保存')}</button>}
        <button type="button" className={editing.id ? 'secondary' : 'primary'} disabled={busy} onClick={() => void commit(true)}><Save size={15} />{tr('另存为新顺序')}</button>
        {editing.id && <button type="button" className="secondary" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />{tr('删除此顺序')}</button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(null); setMessage(''); }}><X size={15} />{tr('取消')}</button>
      </div>
    </section>}
  </div>;
}

// Saved practice orders for one question set. Orders only list question ids, so Q numbers,
// answers and reviews stay attached to the questions themselves and survive any reordering.
export type QuestionOrder = {
  id: string;
  name: string;
  questionIds: string[];
  /** When true, questions omitted from questionIds stay hidden instead of following the saved order. */
  onlySelected?: boolean;
};
export type QuestionOrders = {
  /** The question set id; one record per set, kept apart from the set so agent rewrites never drop it. */
  id: string;
  /** null means the built-in interview-flow order. */
  activeOrderId: string | null;
  orders: QuestionOrder[];
  revision: number;
  updatedAt: string;
};

export const MAX_QUESTION_ORDERS = 20;
export const MAX_ORDER_NAME = 40;

/** Questions in the saved order; ids no longer in the set are skipped and new questions follow in set order. */
export function applyQuestionOrder<T extends { id: string }>(
  questions: T[],
  questionIds: readonly string[] | undefined,
  onlySelected = false,
): T[] {
  if (!questionIds?.length) return onlySelected ? [] : questions;
  const byId = new Map(questions.map(q => [q.id, q]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const id of questionIds) {
    const q = byId.get(id);
    if (q && !seen.has(id)) { ordered.push(q); seen.add(id); }
  }
  return onlySelected ? ordered : [...ordered, ...questions.filter(q => !seen.has(q.id))];
}

export function activeQuestionOrder(orders: QuestionOrders | undefined): QuestionOrder | undefined {
  return orders?.activeOrderId ? orders.orders.find(o => o.id === orders.activeOrderId) : undefined;
}

/** Moves one question to sit right after another (or to the top when `afterId` is null). */
export function moveQuestionAfter(ids: string[], movingId: string, afterId: string | null): string[] {
  if (movingId === afterId || !ids.includes(movingId)) return ids;
  const rest = ids.filter(id => id !== movingId);
  const at = afterId === null ? 0 : rest.indexOf(afterId) + 1;
  if (afterId !== null && at === 0) return ids;
  return [...rest.slice(0, at), movingId, ...rest.slice(at)];
}

type PracticeAttempt = { questionSetId: string; questionId: string; createdAt: string; id: string };

/**
 * Least practised first, from the real record: never answered, then answered without a review, then
 * fewest reviewed answers; ties keep the earlier-practised question first and otherwise the current order.
 */
export function unfamiliarFirst(
  questionIds: string[],
  packId: string,
  attempts: readonly PracticeAttempt[],
  reviewedAttemptIds: ReadonlySet<string>,
): string[] {
  const stats = new Map(questionIds.map(id => [id, { tries: 0, reviewed: 0, last: '' }]));
  for (const a of attempts) {
    const s = a.questionSetId === packId ? stats.get(a.questionId) : undefined;
    if (!s) continue;
    s.tries += 1;
    if (reviewedAttemptIds.has(a.id)) s.reviewed += 1;
    if (a.createdAt > s.last) s.last = a.createdAt;
  }
  const rank = (id: string) => {
    const s = stats.get(id)!;
    return s.tries === 0 ? 0 : s.reviewed === 0 ? 1 : 2;
  };
  return questionIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => {
      const sa = stats.get(a.id)!, sb = stats.get(b.id)!;
      return rank(a.id) - rank(b.id) || sa.reviewed - sb.reviewed || sa.tries - sb.tries ||
        sa.last.localeCompare(sb.last) || a.index - b.index;
    })
    .map(item => item.id);
}

/**
 * Where one company's interview preparation stands, derived from what exists:
 * materials, a question set, answers and a queued agent task. One label per stage so the
 * company list reads the same way everywhere.
 */
export const prepStages = ['未开始', '生成中', '资料整理中', '待练习', '练习中', '已练完'] as const;
export type PrepStage = (typeof prepStages)[number];

export type PrepProgress = {
  /** Material kinds written so far, out of `materialTotal`. */
  materials: number;
  materialTotal: number;
  /** Questions in the latest set (0 when there is none) and how many have an answer. */
  questions: number;
  answered: number;
  /** A "公司准备" task is queued and no output has arrived yet. */
  pending: boolean;
};

export function prepStage(p: PrepProgress): PrepStage {
  if (p.questions > 0) return p.answered === 0 ? '待练习' : p.answered >= p.questions ? '已练完' : '练习中';
  if (p.pending) return '生成中';
  return p.materials > 0 ? '资料整理中' : '未开始';
}

/** Sort weight: further along sorts later; within a stage, more progress sorts later. */
export function prepRank(p: PrepProgress): number {
  const stage = prepStages.indexOf(prepStage(p));
  const fraction = p.questions ? p.answered / p.questions : p.materialTotal ? p.materials / p.materialTotal : 0;
  return stage + fraction * 0.9;
}

export const prepStageTone: Record<PrepStage, string> = {
  未开始: 'gray',
  生成中: 'slate',
  资料整理中: 'indigo',
  待练习: 'blue',
  练习中: 'strong',
  已练完: 'green',
};

import bank from './data/interview-bank.json';
import type { QuestionSet } from './career';

/**
 * Built-in interview question bank: general questions that most companies ask,
 * plus the ones international students in Japan meet repeatedly. It is not tied
 * to any saved job; company-specific packs still come from the 公司准备 task.
 */
export const BANK_JOB_ID = 'builtin:general';

export const builtinQuestionSets: QuestionSet[] = bank.map((pack) => ({
  ...pack,
  jobId: BANK_JOB_ID,
  createdAt: '',
}));

export function isBuiltinQuestionSet(id: string) {
  return builtinQuestionSets.some((pack) => pack.id === id);
}

export function findBuiltinQuestionSet(id: string) {
  return builtinQuestionSets.find((pack) => pack.id === id);
}

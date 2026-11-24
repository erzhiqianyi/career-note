/** Application statuses, in pipeline order. Shared by the app, the Worker and the MCP tool schema. */
export const jobStatuses = [
  '关注中',
  '准备投递',
  '已投递',
  '轻松面谈',
  '书类选考',
  '适性检查',
  '面试中',
  '一次面试',
  '二次面试',
  '最终面试',
  '条件面谈',
  '结果待确认',
  '内定',
  '未通过',
  '已撤回',
] as const;
export type JobStatus = typeof jobStatuses[number];

/** 面试中 is retained as the backwards-compatible, round-unspecified interview stage. */
export const interviewStatuses = ['面试中', '一次面试', '二次面试', '最终面试', '条件面谈'] as const;
export const selectionProgressStatuses = [
  '已投递',
  '轻松面谈',
  '书类选考',
  '适性检查',
  ...interviewStatuses,
  '结果待确认',
  '内定',
] as const;

export const isInterviewStatus = (status: string) => (interviewStatuses as readonly string[]).includes(status);
export const isSelectionProgressStatus = (status: string) => (selectionProgressStatuses as readonly string[]).includes(status);
export const isActiveSelectionStatus = (status: string) => status !== '内定' && isSelectionProgressStatus(status);

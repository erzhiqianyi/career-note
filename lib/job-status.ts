/** Application statuses, in pipeline order. Shared by the app, the Worker and the MCP tool schema. */
export const jobStatuses = ['关注中', '准备投递', '已投递', '书类选考', '面试中', '内定', '未通过', '已撤回'] as const;
export type JobStatus = typeof jobStatuses[number];

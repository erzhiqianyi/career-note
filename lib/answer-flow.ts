import { z } from 'zod';

const id = z.string().trim().min(1).max(120);
export const answerFlowSchema = z.object({
  version: z.literal(1),
  nodes: z.array(z.object({
    id,
    title: z.string().trim().min(1).max(200),
    cue: z.string().trim().max(500).optional(),
    detail: z.string().max(10000).optional(),
    cautions: z.string().max(5000).optional(),
  }).strict()).min(1).max(12),
  followUps: z.array(z.object({
    id,
    question: z.string().trim().min(1).max(5000),
    nodeId: id.optional(),
    questionId: id.optional(),
  }).strict()).max(40),
}).strict().superRefine((flow, ctx) => {
  const nodes = new Set(flow.nodes.map(node => node.id));
  if (nodes.size !== flow.nodes.length) ctx.addIssue({ code: 'custom', message: '流程节点 id 重复' });
  if (new Set(flow.followUps.map(item => item.id)).size !== flow.followUps.length)
    ctx.addIssue({ code: 'custom', message: '追问 id 重复' });
  for (const item of flow.followUps) {
    if (item.nodeId && !nodes.has(item.nodeId)) ctx.addIssue({ code: 'custom', message: '追问引用的节点不存在' });
  }
});

export type AnswerFlow = z.infer<typeof answerFlowSchema>;

// Career Note's MCP tool table. Every tool is a thin wrapper over the authenticated REST API,
// so scope checks, tenancy and validation stay in one place; the gateway only routes and audits.
import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from '@erzhiqian/agent-gateway';
import { personalizedResumeSchema } from '../lib/personalized-resume';
import { resumeWriteSchema, resumeSections } from '../lib/resume';
import protocol from '../lib/career-protocol.generated.json';

export const CAREER_SCOPES = {
  'career:read': { description: 'Read profile, resume, jobs, materials, tasks and practice records', required: true },
  'agent:write': { description: 'Save research reports, material versions, question sets and reviews; queue preparation tasks', default: true },
  'career:write': { description: 'Update the profile summary and resume records only when asked', default: false },
} as const;

export const CAREER_CONTRACT: string = protocol.workflow;

export type Invoke = (ctx: ToolContext, path: string, body?: Record<string, unknown>) => Promise<Response>;

const bundle = z
  .object({
    schemaVersion: z.literal(1),
    jobs: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    materials: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    reports: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    questionSets: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    reviews: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
    completeTaskIds: z.array(z.string()).max(200),
  })
  .strict();

export function createCareerTools(invoke: Invoke): AgentTool[] {
  const api = async (ctx: ToolContext, path: string, body?: Record<string, unknown>): Promise<ToolResult> => {
    const response = await invoke(ctx, path, body);
    const data = await response.json();
    return { content: [{ type: 'text', text: JSON.stringify(data) }], isError: !response.ok };
  };
  return [
    {
      name: 'career_get_contract',
      description: 'Read the maintained Career Note data contract before preparing writes. Includes field requirements, evidence rules, import sequencing and versioning.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async () => ({ content: [{ type: 'text', text: CAREER_CONTRACT }] }),
    },
    {
      name: 'career_get_context',
      scope: 'career:read',
      description: 'Read only the authenticated user’s profile, structured resume records, jobs, materials, reports, tasks, question sets, original attempts and reviews.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (_args, ctx) => api(ctx, 'state'),
    },
    {
      name: 'career_get_resume',
      scope: 'career:read',
      description: 'Read structured resume entries and supported fields. Archived entries are included for recovery. Each record has its own revision; document content is immutable.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (_args, ctx) => {
        const value = await api(ctx, 'resume');
        return { ...value, content: [...value.content, { type: 'text', text: JSON.stringify({ sections: resumeSections }) }] };
      },
    },
    {
      name: 'career_resume_history',
      scope: 'career:read',
      description: 'Read saved revisions of one resume entry belonging to this user.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ id }, ctx) => api(ctx, 'resume/history?id=' + encodeURIComponent(String(id))),
    },
    {
      name: 'career_save_resume_entry',
      scope: 'career:write',
      description: 'Create or update one structured resume record only when requested. Read career_get_resume first. Use revision 0 and a new id to create; pass all data fields and latest revision to update. Set archived to archive or restore; original documents require a new id for a new version. Never invent facts or use this to alter applications.',
      inputSchema: resumeWriteSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: (payload, ctx) => api(ctx, 'resume', payload),
    },
    {
      name: 'career_get_personalized_resumes',
      scope: 'career:read',
      description: 'Read this user’s personalized resume drafts and publication snapshots. Private notes and sources must not be copied into public content.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (_args, ctx) => api(ctx, 'personalized-resumes'),
    },
    {
      name: 'career_save_personalized_resume',
      scope: 'career:write',
      description: 'Save an evidence-based personalized resume draft. Read structured resume and existing drafts first. New id with revision 0 creates; latest revision updates. Public content is an explicit allowlist. This never publishes; user previews and publishes in the app.',
      inputSchema: personalizedResumeSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      handler: (payload, ctx) => api(ctx, 'personalized-resumes', payload),
    },
    {
      name: 'career_preview_import',
      scope: 'agent:write',
      description: 'Validate an import without writing. Read career_get_contract first. Preview does not check every relationship; import is incremental, not atomic.',
      inputSchema: { bundle },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ bundle }, ctx) => api(ctx, 'import/preview', bundle as Record<string, unknown>),
    },
    {
      name: 'career_import',
      scope: 'agent:write',
      description: 'Save requested research, versioned materials, questions, reviews or outcome-analysis reports to this user’s workspace. Cannot write original answers or application status. Read back IDs after success or partial failure; never retry blindly.',
      inputSchema: { bundle },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: ({ bundle }, ctx) => api(ctx, 'import', bundle as Record<string, unknown>),
    },
    {
      name: 'career_create_task',
      scope: 'agent:write',
      description: 'Queue a preparation task. Does not generate content, submit applications or contact employers.',
      inputSchema: {
        kind: z.enum(['每日分析', '公司准备', '职位研究', '回答点评']),
        jobId: z.string().optional(),
        attemptId: z.string().optional(),
        instructions: z.string().max(100000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      handler: (payload, ctx) => api(ctx, 'tasks', payload),
    },
    {
      name: 'career_update_profile',
      scope: 'career:write',
      description: 'Update the user’s profile only when requested. Read current revision and preserve unspecified fields. Source documents are not modified. A stale revision is rejected.',
      inputSchema: {
        revision: z.number().int().nonnegative(),
        summary: z.string(),
        skills: z.string(),
        experience: z.string(),
        targetRoles: z.string(),
        japanese: z.string(),
        conditions: z.string(),
        sourcePath: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      handler: (payload, ctx) => api(ctx, 'profile', payload),
    },
  ];
}

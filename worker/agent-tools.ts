// Career Note's MCP tool table. Every tool is a thin wrapper over the authenticated REST API,
// so scope checks, tenancy and validation stay in one place; the gateway only routes and audits.
import { z } from 'zod';
import type { AgentTool, ToolContext, ToolResult } from '@ninomae/mcp-app-server';
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
    const data: unknown = await response.json();
    // structuredContent (MCP 2025-06-18) carries the same JSON for hosts that render it; text stays for older clients.
    const structured = data && typeof data === 'object' && !Array.isArray(data) ? { structuredContent: data as Record<string, unknown> } : {};
    return { content: [{ type: 'text', text: JSON.stringify(data) }], ...structured, isError: !response.ok };
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
      handler: (_args, ctx) => api(ctx, 'state?resumeView=summary'),
    },
    {
      name: 'career_get_attempt_audio',
      scope: 'career:read',
      description: 'Get a short-lived (15 min) download URL for the recording of one saved interview answer (attempt id from career_get_context; attempts with audio carry an `audio` field). Download it with curl and transcribe it locally (e.g. whisper) before reviewing pronunciation, pace or pauses; the transcript never replaces the user’s saved answer text.',
      inputSchema: { attemptId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ attemptId }, ctx) => api(ctx, 'attempts/audio-link', { attemptId }),
    },
    {
      name: 'career_get_resume',
      scope: 'career:read',
      description: 'Read structured resume entries and document version metadata, including archived entries, plus supported fields. Document data.content is omitted. Use career_get_resume_version with id and revision for one full version; career_resume_history lists revisions.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (_args, ctx) => {
        const value = await api(ctx, 'resume?view=summary');
        return { ...value, content: [...value.content, { type: 'text', text: JSON.stringify({ sections: resumeSections }) }] };
      },
    },
    {
      name: 'career_get_resume_overview',
      scope: 'career:read',
      description: 'Read counts and update metadata for the authenticated resume library. No document content is returned.',
      inputSchema: { kind: z.string().optional(), language: z.enum(['ja', 'zh', 'en']).optional(), archived: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ kind, language, archived }, ctx) => api(ctx, 'resume/overview?' + new URLSearchParams(Object.entries({ kind, language, archived }).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))),
    },
    {
      name: 'career_list_resume',
      scope: 'career:read',
      description: 'List paginated resume metadata and previews. Defaults to 20 active records and never returns document content.',
      inputSchema: { kind: z.string().optional(), language: z.enum(['ja', 'zh', 'en']).optional(), archived: z.boolean().optional(), pageSize: z.number().int().min(1).max(20).optional(), cursor: z.string().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (args, ctx) => api(ctx, 'resume/list?' + new URLSearchParams(Object.entries(args).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))),
    },
    {
      name: 'career_get_resume_details',
      scope: 'career:read',
      description: 'Read up to five selected resume records by id. Use the list tool first; only requested records are returned.',
      inputSchema: { ids: z.array(z.string()).min(1).max(5) },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ ids }, ctx) => api(ctx, 'resume/details?' + (ids as string[]).map((id) => 'id=' + encodeURIComponent(id)).join('&')),
    },
    {
      name: 'career_get_resume_document_chunk',
      scope: 'career:read',
      description: 'Read one bounded Unicode-code-point chunk of one document revision. Continue with nextOffset when hasMore is true.',
      inputSchema: { id: z.string().min(1), revision: z.number().int().positive(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(12000).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ id, revision, offset, limit }, ctx) => api(ctx, 'resume/document?id=' + encodeURIComponent(String(id)) + '&revision=' + String(revision) + (offset === undefined ? '' : '&offset=' + String(offset)) + (limit === undefined ? '' : '&limit=' + String(limit))),
    },
    {
      name: 'career_resume_history',
      scope: 'career:read',
      description: 'List saved revision metadata of one resume entry. No data or document content is returned. Use career_get_resume_version with id and revision to read one full snapshot.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ id }, ctx) => api(ctx, 'resume/history?id=' + encodeURIComponent(String(id)) + '&view=summary'),
    },
    {
      name: 'career_get_resume_version',
      scope: 'career:read',
      description: 'Read exactly one saved resume revision, including document content, by id and revision from career_get_resume or career_resume_history. Document data.version is a display label; revision is the numeric saved revision.',
      inputSchema: { id: z.string().min(1), revision: z.number().int().positive() },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: ({ id, revision }, ctx) => api(ctx, 'resume/version?id=' + encodeURIComponent(String(id)) + '&revision=' + String(revision)),
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
      name: 'career_delete_resume_document',
      scope: 'career:write',
      description: 'Permanently delete one archived resume document and all its revisions when the owner explicitly requests deletion. Requires its current revision. Fails if a personalized resume references it; never deletes structured career facts.',
      inputSchema: { id: z.string().min(1).max(100), revision: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      handler: (payload, ctx) => api(ctx, 'resume/delete', payload),
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
      name: 'career_get_readings',
      scope: 'career:read',
      description: 'Legacy glossary read for older clients. New Japanese materials save readings inline as {漢字|かな}; use career_get_context to read the material being revised.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (_args, ctx) => api(ctx, 'readings?include=bank'),
    },
    {
      name: 'career_save_readings',
      scope: 'agent:write',
      description: 'Legacy glossary write for older clients only. For new or revised Japanese material save readings inline as {漢字|かな} with that material. Never use this tool for official ふりがな fields.',
      inputSchema: { entries: z.array(z.object({ word: z.string().min(1).max(32), reading: z.string().min(1).max(64), note: z.string().max(200).optional() })).min(1).max(200) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: ({ entries }, ctx) => api(ctx, 'readings', { entries }),
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
        targetDate: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      handler: (payload, ctx) => api(ctx, 'profile', payload),
    },
  ];
}

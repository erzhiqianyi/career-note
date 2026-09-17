import { apiUrl } from './api-base';
import { freshAuthToken } from './career-auth';
export const statuses = [
  '关注中',
  '准备投递',
  '已投递',
  '书类选考',
  '面试中',
  '内定',
  '未通过',
  '已撤回',
];
export const materialKinds = [
  '履歴書',
  '職務経歴書',
  '志望動機',
  '面试准备',
  '公司研究',
];
export type Job = {
  id: string;
  company: string;
  role: string;
  url: string;
  description: string;
  requirements: string;
  business: string;
  japanese: string;
  foreigner: string;
  visa: string;
  salary: string;
  location: string;
  sourceDate: string;
  matchNotes: string;
  unknowns: string;
  status: string;
  priority: string;
  nextAction: string;
  nextDate: string;
  notes: string;
  history: { status: string; at: string }[];
  revision: number;
  updatedAt: string;
};
export type Profile = {
  revision: number;
  summary: string;
  skills: string;
  experience: string;
  targetRoles: string;
  japanese: string;
  conditions: string;
  sourcePath: string;
  targetDate: string;
  updatedAt: string;
};
export type Material = {
  id: string;
  title: string;
  content: string;
  sourceNotes: string;
  jobId: string;
  kind: string;
  createdAt: string;
  reviewStatus: string;
  jobRevision: number;
  profileRevision: number;
};
export type Report = {
  id: string;
  title: string;
  content: string;
  sourceNotes: string;
  date: string;
  createdAt: string;
};
export type Task = {
  attemptId?: string;
  id: string;
  kind: string;
  jobId: string;
  status: string;
  createdAt: string;
  instructions: string;
};

export type AuthContext = {
  uid: string;
  admin: boolean;
  mode: string;
  claims: Record<string, unknown>;
  tokenType?: 'firebase' | 'mcp';
  scopes?: string[];
};

export type MpcTokenRecord = {
  id: string;
  name: string;
  ownerUid: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  revoked: boolean;
  expired?: boolean;
  prefix: string;
  clientId?: string;
};

export type AgentActivity = {
  id: string;
  tokenId: string;
  clientId: string;
  clientName: string;
  event: string;
  ok: boolean;
  detail: Record<string, unknown> | null;
  at: string;
};

export type State = {
  resume: import('./resume').ResumeEntry[];
  platforms: import('./job-platforms').JobPlatform[];
  jobs: Job[];
  profile: Profile;
  materials: Material[];
  reports: Report[];
  tasks: Task[];
  today: string;
  questionSets: QuestionSet[];
  attempts: Attempt[];
  reviews: AnswerReview[];
};
let authToken: string | null = null;
export function setAuthToken(nextToken: string | null) {
  authToken = nextToken;
  if (typeof localStorage !== 'undefined') localStorage.removeItem('career_id_token');
}

export function getAuthToken() {
  return authToken;
}

export async function api<T = unknown>(path: string, data?: unknown) {
  authToken = await freshAuthToken();
  const headers: Record<string, string> = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (typeof authToken === 'string' && authToken.length > 0) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const response = await fetch(apiUrl(path), {
    method: data === undefined ? 'GET' : 'POST',
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error((value as { error?: string }).error || '请求失败');
  return value as T;
}
export function download(
  name: string,
  content: string,
  type = 'text/markdown',
) {
  const url = URL.createObjectURL(
    new Blob([content], { type: type + ';charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Question = {
  id: string;
  title: string;
  questionJa: string;
  meaning: string;
  why: string;
  outline: string;
  followUps: string;
  category: string;
  targetSeconds: number;
  simpleQuestionJa?: string;
  vocabulary?: string;
  // Built-in bank only: how to adapt the answer to the user's own situation.
  personalize?: string;
  profileFields?: string[];
};
export type QuestionSet = {
  candidateContext?: string;
  communicationGuide?: string;
  id: string;
  jobId: string;
  title: string;
  scenario: string;
  plan: string;
  sourceNotes: string;
  questions: Question[];
  createdAt: string;
};
export type Attempt = {
  id: string;
  questionSetId: string;
  questionId: string;
  question: Question;
  jobId: string;
  answer: string;
  language: string;
  durationSeconds: number;
  profileRevision: number;
  createdAt: string;
};
export type AnswerReview = {
  foreignApplicantNotes?: string;
  simpleAnswer?: string;
  id: string;
  attemptId: string;
  jobId: string;
  summary: string;
  strengths: string;
  improvements: string;
  japaneseNotes: string;
  factChecks: string;
  revisedAnswer: string;
  followUps: string;
  nextPractice: string;
  sourceNotes: string;
  createdAt: string;
};

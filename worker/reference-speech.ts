export const REFERENCE_VOICES = ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'] as const;
const MAX_TEXT_LENGTH = 3_000;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export class ReferenceSpeechError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function numberedReferenceQuestions(source: string): string[] {
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines.every(line => /^[①-⑳]/u.test(line))) return [];
  return lines.map(line => line.replace(/^[①-⑳]\s*/u, ''));
}

export function plainReferenceSpeech(source: string): string {
  return source.replace(/\{([^{}|\n]+)\|[ぁ-ゖァ-ヺー・]+\}/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/gmu, '')
    .replace(/\*\*|`/gu, '')
    .trim();
}

function escapeXML(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function referenceSpeechKey(uid: string, packId: string, questionId: string,
                                         voice: string, text: string): Promise<string> {
  return `${referenceSpeechPackPrefix(uid, packId)}${encodeURIComponent(questionId)}/`
    + `${voice}/${await digest(text)}.mp3`;
}

export function referenceSpeechPackPrefix(uid: string, packId: string): string {
  return `${uid}/reference-speech/v1/${encodeURIComponent(packId)}/`;
}

export async function deleteReferenceSpeechForPacks(bucket: R2Bucket, uid: string, packIds: string[]): Promise<void> {
  for (const packId of packIds) {
    const prefix = referenceSpeechPackPrefix(uid, packId);
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor });
      keys.push(...page.objects.map(object => object.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    for (let index = 0; index < keys.length; index += 1_000)
      await bucket.delete(keys.slice(index, index + 1_000));
  }
}

function audioResponse(body: ReadableStream | ArrayBuffer, size?: number): Response {
  return new Response(body, { headers: {
    'content-type': 'audio/mpeg',
    ...(size === undefined ? {} : { 'content-length': String(size) }),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  } });
}

export async function referenceSpeechResponse(input: {
  uid: string;
  packId: string;
  questionId: string;
  source: string;
  voice: string;
  sampleAnswer: string;
  category: string;
  bucket: R2Bucket;
  azureRegion?: string;
  azureKey?: string;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const { uid, packId, questionId, source, voice, sampleAnswer, category, bucket } = input;
  if (!REFERENCE_VOICES.includes(voice as typeof REFERENCE_VOICES[number]))
    throw new ReferenceSpeechError(400, '音声の種類が正しくありません');
  const numbered = category === '逆質問' ? numberedReferenceQuestions(sampleAnswer) : [];
  const allowed = numbered.length ? numbered : [sampleAnswer];
  if (!allowed.includes(source)) throw new ReferenceSpeechError(409, '参考回答が更新されました。同期してから再試行してください');
  const text = plainReferenceSpeech(source);
  if (!text || text.length > MAX_TEXT_LENGTH) throw new ReferenceSpeechError(400, '朗読する文章の長さが正しくありません');
  const key = await referenceSpeechKey(uid, packId, questionId, voice, text);
  const cached = await bucket.get(key);
  if (cached) return audioResponse(cached.body, cached.size);

  const region = (input.azureRegion || '').trim().toLowerCase();
  const subscriptionKey = input.azureKey || '';
  if (!/^[a-z0-9]+$/u.test(region) || !subscriptionKey)
    throw new ReferenceSpeechError(503, '音声サービスが設定されていません');
  const ssml = `<speak version="1.0" xml:lang="ja-JP"><voice name="${voice}">${escapeXML(text)}</voice></speak>`;
  let response: Response;
  try {
    response = await (input.fetcher || fetch)(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/ssml+xml; charset=utf-8',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'CareerNote-Worker',
      },
      body: ssml,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ReferenceSpeechError(503, '音声サービスに接続できません');
  }
  if (response.status === 429) throw new ReferenceSpeechError(429, '音声サービスが混み合っています');
  if (!response.ok) throw new ReferenceSpeechError(503, '音声の生成に失敗しました');
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('audio/')) throw new ReferenceSpeechError(502, '音声データを取得できませんでした');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO_BYTES)
    throw new ReferenceSpeechError(502, '音声データのサイズが正しくありません');
  await bucket.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  return audioResponse(bytes, bytes.byteLength);
}

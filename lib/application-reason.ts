import { plainJapanese } from './japanese-readings';

type ReasonSource = { jobId: string; kind: string; createdAt: string; applicationReason?: string; archivedAt?: string };

/**
 * The copy-ready ご応募理由 for one job: the short version of its newest 志望動機 that is still in
 * use, without study readings. Empty when no current version carries one.
 */
export function currentApplicationReason(materials: ReasonSource[], jobId: string): string {
  let newest = '';
  let reason = '';
  for (const m of materials) {
    if (m.kind !== '志望動機' || m.archivedAt || (m.jobId || '') !== jobId) continue;
    const text = plainJapanese(m.applicationReason || '').trim();
    if (text && m.createdAt >= newest) {
      newest = m.createdAt;
      reason = text;
    }
  }
  return reason;
}

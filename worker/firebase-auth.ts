import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyFirebaseToken(token: string, projectId: string, keys: JWTVerifyGetKey = googleKeys) {
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'], issuer: `https://securetoken.google.com/${projectId}`, audience: projectId,
    requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
  });
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || payload.sub.length > 128 || typeof payload.iat !== 'number' || payload.iat > now ||
      typeof payload.auth_time !== 'number' || payload.auth_time > now || payload.auth_time < 0) throw new Error('Invalid Firebase claims');
  const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
  if (firebase?.sign_in_provider !== 'google.com' || payload.email_verified !== true || typeof payload.email !== 'string') throw new Error('Verified Google account required');
  return payload;
}
export function allowedAccount(payload: {sub?: string; email?: unknown}, uids = '', emails = '') {
  const values = (raw: string) => raw.split(',').map(value => value.trim()).filter(Boolean);
  return values(uids).includes(payload.sub || '') || values(emails).map(value => value.toLowerCase()).includes((typeof payload.email === 'string' ? payload.email.toLowerCase() : ''));
}

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

export const origin = 'http://local';
export const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
export const post = (mf, path, body, headers = {}) => mf.dispatchFetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
export const json = async (response, status = 200) => { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; };

// Drives register → authorize → approve → token like an MCP client would, returning the token response.
export async function authorizeAgent(mf, { redirect = 'http://localhost:5555/callback', name = 'Test agent', approveHeaders = {}, scopes, scope, authMethod = 'none', resource } = {}) {
  const client = await json(await post(mf, '/api/career/oauth/register', { client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: authMethod, ...(scope ? { scope } : {}) }), 201);
  const { verifier, challenge } = pkce();
  const params = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect.replace('5555', '6001'), code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', ...(scope ? { scope } : {}), ...(resource ? { resource } : {}) });
  const authorize = await mf.dispatchFetch(origin + '/api/career/oauth/authorize?' + params, { redirect: 'manual' });
  assert.equal(authorize.status, 302);
  const consent = new URL(authorize.headers.get('location'));
  assert.equal(consent.pathname, '/oauth/authorize');
  assert.equal(consent.searchParams.get('client_id'), client.client_id);
  const approved = await json(await post(mf, '/api/career/oauth/approve', { ...Object.fromEntries(new URLSearchParams(consent.search)), decision: 'approve', ...(scopes ? { scopes } : {}) }, approveHeaders));
  const callback = new URL(approved.redirect);
  assert.equal(callback.searchParams.get('state'), 'xyz');
  const code = callback.searchParams.get('code');
  assert.ok(code);
  const tokenBody = { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: params.get('redirect_uri'), ...(resource ? { resource } : {}) };
  if (client.client_secret) tokenBody.client_secret = client.client_secret;
  const issued = await json(await post(mf, '/api/career/oauth/token', tokenBody));
  return { client, issued, code, verifier, tokenBody };
}


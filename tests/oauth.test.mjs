import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { authorizeAgent, pkce, post, json, origin } from './oauth-client.mjs';

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
async function worker(t, bindings = {}) {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'], bindings });
  t.after(() => mf.dispose());
  return mf;
}
void test('discovery documents point at this origin and the MCP endpoint challenges for OAuth', async (t) => {
  const mf = await worker(t);
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/career/mcp']) {
    const meta = await json(await mf.dispatchFetch(origin + path));
    assert.equal(meta.resource, origin + '/api/career/mcp');
    assert.deepEqual(meta.authorization_servers, [origin]);
  }
  const server = await json(await mf.dispatchFetch(origin + '/.well-known/oauth-authorization-server'));
  assert.equal(server.token_endpoint, origin + '/api/career/oauth/token');
  assert.deepEqual(server.code_challenge_methods_supported, ['S256']);
  const challenge = await mf.dispatchFetch(origin + '/api/career/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(challenge.status, 401);
  assert.match(challenge.headers.get('www-authenticate'), /resource_metadata="http:\/\/local\/\.well-known\/oauth-protected-resource"/);
  const bad = await mf.dispatchFetch(origin + '/api/career/mcp', { method: 'POST', headers: { Authorization: 'Bearer mcp_forged', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(bad.status, 401);
  assert.match(bad.headers.get('www-authenticate'), /invalid_token/);
});

void test('local mode: a loopback client obtains a token through the full grant and can call MCP tools', async (t) => {
  const mf = await worker(t);
  const { client, issued, code, verifier } = await authorizeAgent(mf, { scopes: ['career:read', 'agent:write'], resource: origin + '/api/career/mcp' });
  assert.match(issued.access_token, /^mcp_/);
  assert.match(issued.refresh_token, /^agr_/);
  assert.equal(issued.scope, 'career:read agent:write');
  const rpc = async (token, method, params = {}) => json(await mf.dispatchFetch(origin + '/api/career/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  const listed = await rpc(issued.access_token, 'tools/list');
  assert.ok(listed.result.tools.some((tool) => tool.name === 'career_import'));
  assert.ok(!listed.result.tools.some((tool) => tool.name === 'career_update_profile'));
  // The owner sees the grant in the token list, named after the client.
  const tokens = await json(await mf.dispatchFetch(origin + '/api/career/mcp/tokens'));
  assert.equal(tokens.tokens.length, 1);
  assert.equal(tokens.tokens[0].name, 'Test agent');
  assert.equal(tokens.tokens[0].clientId, client.client_id);
  // Manual issuance is gone.
  assert.equal((await post(mf, '/api/career/mcp/tokens', { name: 'Manual' })).status, 404);
  // The audit trail attributes the grant and every tool call to this token, without payloads.
  await rpc(issued.access_token, 'tools/call', { name: 'career_preview_import', arguments: { bundle: { schemaVersion: 1, reports: [{ id: 'r1', date: '2026-09-15', title: 'T', content: 'C', sourceNotes: 'S' }], completeTaskIds: [] } } });
  const activity = (await json(await mf.dispatchFetch(origin + '/api/career/mcp/activity?tokenId=' + tokens.tokens[0].id))).activity;
  assert.deepEqual(activity.map((row) => row.event).reverse(), ['authorized', 'tool:import/preview']);
  assert.equal(activity[0].detail.requested.reports, 1);
  assert.ok(!JSON.stringify(activity).includes('sourceNotes'));
  assert.equal((await mf.dispatchFetch(origin + '/api/career/mcp/activity', { headers: { Authorization: 'Bearer ' + issued.access_token } })).status, 403);
  // Replaying the code fails and revokes what it issued.
  await json(await post(mf, '/api/career/oauth/token', { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id }), 400);
  assert.equal((await mf.dispatchFetch(origin + '/api/career/state', { headers: { Authorization: 'Bearer ' + issued.access_token } })).status, 401);
});

void test('refresh rotates the pair, replaying a rotated refresh token revokes the chain, revoke from the UI kills refresh', async (t) => {
  const mf = await worker(t);
  const { client, issued } = await authorizeAgent(mf);
  const refreshed = await json(await post(mf, '/api/career/oauth/token', { grant_type: 'refresh_token', refresh_token: issued.refresh_token, client_id: client.client_id }));
  assert.notEqual(refreshed.access_token, issued.access_token);
  assert.equal((await mf.dispatchFetch(origin + '/api/career/state', { headers: { Authorization: 'Bearer ' + issued.access_token } })).status, 401);
  assert.equal((await mf.dispatchFetch(origin + '/api/career/state', { headers: { Authorization: 'Bearer ' + refreshed.access_token } })).status, 200);
  await json(await post(mf, '/api/career/oauth/token', { grant_type: 'refresh_token', refresh_token: issued.refresh_token, client_id: client.client_id }), 400);
  assert.equal((await mf.dispatchFetch(origin + '/api/career/state', { headers: { Authorization: 'Bearer ' + refreshed.access_token } })).status, 401);
  const again = await authorizeAgent(mf);
  const tokens = await json(await mf.dispatchFetch(origin + '/api/career/mcp/tokens'));
  const live = tokens.tokens.find((row) => !row.revoked);
  await json(await post(mf, '/api/career/mcp/tokens/revoke', { id: live.id }));
  // Revoked grants stay listed as archive entries and the trail records refresh and revocation.
  const after = (await json(await mf.dispatchFetch(origin + '/api/career/mcp/tokens'))).tokens;
  assert.ok(after.every((row) => row.revoked));
  const trail = (await json(await mf.dispatchFetch(origin + '/api/career/mcp/activity'))).activity.map((row) => row.event);
  assert.ok(trail.includes('refreshed') && trail.includes('revoked'));
  await json(await post(mf, '/api/career/oauth/token', { grant_type: 'refresh_token', refresh_token: again.issued.refresh_token, client_id: again.client.client_id }), 400);
  // Agents cannot manage tokens even with a valid access token.
  assert.equal((await mf.dispatchFetch(origin + '/api/career/mcp/tokens', { headers: { Authorization: 'Bearer ' + again.issued.access_token } })).status, 401);
});

void test('registration and grant validation reject unsafe or mismatched inputs', async (t) => {
  const mf = await worker(t);
  for (const uri of ['http://evil.example/callback', 'javascript:alert(1)', 'not a url', 'https://ok.example/cb#frag']) {
    await json(await post(mf, '/api/career/oauth/register', { client_name: 'x', redirect_uris: [uri] }), 400);
  }
  for (const uri of ['https://chatgpt.com/connector_platform_oauth_redirect', 'cursor://anysphere.cursor-retrieval/oauth/callback', 'http://127.0.0.1/callback']) {
    await json(await post(mf, '/api/career/oauth/register', { client_name: 'x', redirect_uris: [uri] }), 201);
  }
  const confidential = await authorizeAgent(mf, { redirect: 'https://chatgpt.com/connector_platform_oauth_redirect', authMethod: 'client_secret_post' });
  assert.ok(confidential.client.client_secret);
  await json(await post(mf, '/api/career/oauth/token', { ...confidential.tokenBody, client_secret: 'wrong', grant_type: 'refresh_token', refresh_token: confidential.issued.refresh_token }), 401);
  const client = await json(await post(mf, '/api/career/oauth/register', { client_name: 'x', redirect_uris: ['https://agent.example/cb'] }), 201);
  const { challenge, verifier } = pkce();
  const base = { response_type: 'code', client_id: client.client_id, redirect_uri: 'https://agent.example/cb', code_challenge: challenge, code_challenge_method: 'S256', state: 's' };
  // Unregistered redirect: no redirect is trusted, so the error is returned directly.
  assert.equal((await mf.dispatchFetch(origin + '/api/career/oauth/authorize?' + new URLSearchParams({ ...base, redirect_uri: 'https://other.example/cb' }), { redirect: 'manual' })).status, 400);
  // Trusted redirect but bad PKCE: error goes back to the client via redirect.
  const plain = await mf.dispatchFetch(origin + '/api/career/oauth/authorize?' + new URLSearchParams({ ...base, code_challenge_method: 'plain' }), { redirect: 'manual' });
  assert.equal(plain.status, 302);
  assert.match(plain.headers.get('location'), /^https:\/\/agent\.example\/cb\?error=invalid_request/);
  const wrongResource = await mf.dispatchFetch(origin + '/api/career/oauth/authorize?' + new URLSearchParams({ ...base, resource: 'https://elsewhere.example/mcp' }), { redirect: 'manual' });
  assert.match(wrongResource.headers.get('location'), /error=invalid_target/);
  // Approve cannot be bypassed with a different redirect or with unknown scopes.
  await json(await post(mf, '/api/career/oauth/approve', { ...base, redirect_uri: 'https://other.example/cb', decision: 'approve' }), 400);
  const approved = await json(await post(mf, '/api/career/oauth/approve', { ...base, decision: 'approve', scopes: ['admin', 'career:write'] }));
  const code = new URL(approved.redirect).searchParams.get('code');
  await json(await post(mf, '/api/career/oauth/token', { grant_type: 'authorization_code', code, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier-wrong', client_id: client.client_id }), 400);
  const issued = await json(await post(mf, '/api/career/oauth/token', { grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id }));
  assert.equal(issued.scope, 'career:read career:write');
  const denied = await json(await post(mf, '/api/career/oauth/approve', { ...base, decision: 'deny' }));
  assert.match(denied.redirect, /error=access_denied/);
});

void test('CAREER_PUBLIC_ORIGIN drives discovery and token audience; https origin refuses auth mode off', async (t) => {
  const mf = await worker(t, { CAREER_PUBLIC_ORIGIN: 'https://career.example', CAREER_WEB_ORIGIN: 'http://localhost:4210' });
  const meta = await json(await mf.dispatchFetch(origin + '/.well-known/oauth-protected-resource'));
  assert.equal(meta.resource, 'https://career.example/api/career/mcp');
  const refused = await json(await post(mf, '/api/career/oauth/register', { client_name: 'x', redirect_uris: ['http://localhost/cb'] }), 503);
  assert.equal(refused.error, 'server_error');
  // Anything arriving through Cloudflare (tunnel or edge) is refused while auth is off.
  assert.equal((await mf.dispatchFetch(origin + '/api/career/state', { headers: { 'cf-ray': 'abc-NRT' } })).status, 403);
  const tunnel = await worker(t, { CAREER_PUBLIC_ORIGIN: 'http://tunnel.example', CAREER_WEB_ORIGIN: 'http://localhost:4210' });
  const authorizeUrl = await (async () => {
    const client = await json(await post(tunnel, '/api/career/oauth/register', { client_name: 'x', redirect_uris: ['http://localhost/cb'] }), 201);
    const { challenge } = pkce();
    const params = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: 'http://localhost:9/cb', code_challenge: challenge, code_challenge_method: 'S256' });
    return new URL((await tunnel.dispatchFetch(origin + '/api/career/oauth/authorize?' + params, { redirect: 'manual' })).headers.get('location'));
  })();
  assert.equal(authorizeUrl.origin, 'http://localhost:4210');
  const { issued } = await authorizeAgent(tunnel, { resource: 'http://tunnel.example/api/career/mcp' });
  assert.equal((await tunnel.dispatchFetch(origin + '/api/career/state', { headers: { Authorization: 'Bearer ' + issued.access_token } })).status, 200);
  // A token issued for another audience is not accepted here.
  const other = await worker(t, { CAREER_PUBLIC_ORIGIN: 'http://other.example' });
  const foreign = await authorizeAgent(other);
  const db = await tunnel.getD1Database('CAREER_DB');
  const foreignDb = await other.getD1Database('CAREER_DB');
  const row = await foreignDb.prepare('SELECT * FROM mcp_tokens').first();
  await db.prepare('INSERT INTO mcp_tokens(id, token_hash, token_prefix, name, owner_uid, scopes, created_at, expires_at, revoked, client_id, audience) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?10)').bind(row.id, row.token_hash, row.token_prefix, row.name, row.owner_uid, row.scopes, row.created_at, row.expires_at, row.client_id, row.audience).run();
  assert.equal((await tunnel.dispatchFetch(origin + '/api/career/state', { headers: { Authorization: 'Bearer ' + foreign.issued.access_token } })).status, 401);
});

void test('MCP schema is public and scope-annotated without exposing user data', async (t) => {
  const mf = await worker(t);
  const response = await mf.dispatchFetch(origin + '/api/career/mcp/schema');
  assert.equal(response.status, 200);
  const schema = await response.json();
  assert.equal(schema.endpoint, origin + '/api/career/mcp');
  assert.equal(schema.authorization.resourceMetadata, origin + '/.well-known/oauth-protected-resource');
  const names = schema.tools.map((tool) => tool.name);
  assert.ok(names.includes('career_get_contract') && names.includes('career_import') && names.includes('career_update_profile'));
  const history = schema.tools.find((tool) => tool.name === 'career_resume_history');
  assert.equal(history.scope, 'career:read');
  assert.deepEqual(history.inputSchema.required, ['id']);
  assert.equal(history.inputSchema.properties.id.type, 'string');
  assert.ok(typeof schema.contract === 'string' && schema.contract.length > 100);
  assert.ok(!JSON.stringify(schema).includes('mcp_'), 'schema must not carry tokens');
});

void test('initialize and tools/list are public, tools/call without a token still challenges', async (t) => {
  const mf = await worker(t);
  const rpc = (body) => mf.dispatchFetch(origin + '/api/career/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) });
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'registry-crawler', version: '0' } } });
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.serverInfo.name, 'career-note');
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(list.status, 200);
  const tools = (await list.json()).result.tools;
  const schema = await (await mf.dispatchFetch(origin + '/api/career/mcp/schema')).json();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), schema.tools.map((tool) => tool.name).sort());
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'career_get_context', arguments: {} } });
  assert.equal(call.status, 401);
  assert.match(call.headers.get('www-authenticate'), /resource_metadata=/);
  const mixed = await rpc([{ jsonrpc: '2.0', id: 4, method: 'tools/list' }, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'career_get_context', arguments: {} } }]);
  assert.equal(mixed.status, 401);
});

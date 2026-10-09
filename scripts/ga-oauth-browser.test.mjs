import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SESSION_KEY, BROWSER_PATH, readBrowserSession, validateBrowserCallback, startBrowserConsent, finishBrowserConsent } from './ga-oauth-browser.mjs';
const origin = 'https://donestate.proofandstate.com';
const now = 1791561600000;
const session = () => ({ schema: SESSION_KEY, state: 's'.repeat(43), verifier: 'v'.repeat(64), clientId: 'fixture-client', redirectUri: origin + BROWSER_PATH, expiresAt: now + 60000 });
function storage(value = session()) { const values = new Map(value ? [[SESSION_KEY, JSON.stringify(value)]] : []); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }; }
function callback() { return new URL(origin + BROWSER_PATH + '?code=fixture-code&state=' + 's'.repeat(43) + '&iss=' + encodeURIComponent(origin)); }
test('browser session rejects expiry, foreign targets and malformed PKCE material', () => {
  assert.equal(readBrowserSession(storage(), now).clientId, 'fixture-client');
  for (const bad of [{ expiresAt: now }, { redirectUri: 'https://other.example/callback' }, { verifier: 'short' }, { state: 'short' }]) assert.throws(() => readBrowserSession(storage({ ...session(), ...bad }), now));
});
test('browser callback rejects duplicates, mix-up, wrong state and untrusted callback', () => {
  assert.equal(validateBrowserCallback(callback(), session()), 'fixture-code');
  for (const mutate of [u => u.searchParams.append('code', 'duplicate'), u => u.searchParams.set('state', 'different'), u => u.searchParams.set('iss', 'https://other.example'), u => u.pathname = '/elsewhere', u => u.searchParams.set('error', 'denied')]) { const u = callback(); mutate(u); assert.throws(() => validateBrowserCallback(u, session())); }
});
test('an existing browser session prevents another registration or network call', async () => {
  let calls = 0;
  await assert.rejects(startBrowserConsent(storage(), now, async () => { calls++; throw Error('unexpected'); }), /ALREADY_STARTED/);
  assert.equal(calls, 0);
});
test('callback URL is stripped and session consumed before a single failed exchange; replay makes no request', async () => {
  const s = storage(); let requests = 0; let stripped;
  const fetcher = async () => { assert.equal(s.getItem(SESSION_KEY), null); assert.equal(stripped, origin + BROWSER_PATH); requests++; return new Response('{}', { status: 400 }); };
  const result = await finishBrowserConsent(callback(), s, u => { stripped = u; }, now, fetcher);
  assert.equal(result.passed, false); assert.equal(result.failure, 'CODE_EXCHANGE_HTTP_FAILED'); assert.equal(requests, 1);
  assert.equal(JSON.stringify(result).includes('fixture-code'), false);
  assert.equal(JSON.stringify(result).includes('fixture-client'), false);
  await assert.rejects(finishBrowserConsent(callback(), s, () => {}, now, fetcher)); assert.equal(requests, 1);
});
test('generated browser asset has exact script/style hashes and no Node or external dependency', async () => {
  const source = await readFile(new URL('../apps/mcp-worker/src/ga-oauth-assets.ts', import.meta.url), 'utf8');
  const html = JSON.parse(source.match(/GA_OAUTH_HTML = (.*);\n/)[1]);
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const style = html.match(/<style>([\s\S]*)<\/style>/)[1];
  for (const [type, value] of [['SCRIPT', script], ['STYLE', style]]) assert.equal(JSON.parse(source.match(new RegExp('GA_OAUTH_' + type + '_HASH = (.*);'))[1]), createHash('sha256').update(value).digest('base64'));
  assert.equal(/node:|Buffer\.|<script src=/.test(html), false);
});

import { ORIGIN, RESOURCE, SCOPE, discover, registerClient, exerciseGrant } from './ga-oauth.mjs';

export const BROWSER_PATH = '/acceptance/oauth';
export const SESSION_KEY = 'donestate.fresh-oauth-browser.v1';
const checkBrowser = (ok, code) => { if (!ok) throw new Error(code); };
const browserFailure = (error) => /^[A-Z][A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'UNEXPECTED_FAILURE_REDACTED';
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
export const browserSha256 = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, '0')).join('');

export function readBrowserSession(storage, now = Date.now()) {
  let value;
  try { value = JSON.parse(storage.getItem(SESSION_KEY)); } catch { checkBrowser(false, 'BROWSER_SESSION_INVALID'); }
  checkBrowser(value?.schema === SESSION_KEY && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt <= now + 15 * 60_000, 'BROWSER_SESSION_EXPIRED_OR_MISSING');
  checkBrowser(value.redirectUri === ORIGIN + BROWSER_PATH && typeof value.clientId === 'string' && value.clientId.length > 0, 'BROWSER_SESSION_TARGET_MISMATCH');
  checkBrowser(/^[A-Za-z0-9_-]{43}$/.test(value.state) && /^[A-Za-z0-9_-]{64}$/.test(value.verifier), 'BROWSER_SESSION_INVALID');
  return value;
}

export function validateBrowserCallback(url, session) {
  checkBrowser(url.origin + url.pathname === session.redirectUri, 'CALLBACK_TARGET_MISMATCH');
  for (const name of ['code', 'state', 'iss']) checkBrowser(url.searchParams.getAll(name).length === 1, 'CALLBACK_PARAMETER_COUNT');
  checkBrowser(url.searchParams.get('state') === session.state, 'CALLBACK_STATE_MISMATCH');
  checkBrowser(url.searchParams.get('iss') === ORIGIN, 'CALLBACK_ISSUER_MISMATCH');
  const code = url.searchParams.get('code');
  checkBrowser(code.length > 0 && code.length <= 4096 && !url.searchParams.has('error'), 'CALLBACK_DENIED');
  return code;
}

export async function startBrowserConsent(storage, now = Date.now(), fetcher = fetch) {
  // A second click must not register or replace an in-flight client.
  checkBrowser(storage.getItem(SESSION_KEY) === null, 'BROWSER_SESSION_ALREADY_STARTED');
  await discover(fetcher);
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const redirectUri = ORIGIN + BROWSER_PATH;
  // No automatic retry: registration effects may be ambiguous on a network failure.
  const clientId = await registerClient(redirectUri, fetcher);
  const session = { schema: SESSION_KEY, state, verifier, clientId, redirectUri, expiresAt: now + 15 * 60_000 };
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  const url = new URL(ORIGIN + '/authorize');
  for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, resource: RESOURCE, code_challenge: challenge, code_challenge_method: 'S256', state })) url.searchParams.set(key, value);
  return url.href;
}

export async function finishBrowserConsent(url, storage, stripQuery, now = Date.now(), fetcher = fetch) {
  // Remove the authorization response from the visible URL before any asynchronous operation.
  stripQuery(ORIGIN + BROWSER_PATH);
  const session = readBrowserSession(storage, now);
  const code = validateBrowserCallback(url, session);
  storage.removeItem(SESSION_KEY); // one-shot exchange; refresh/reload cannot replay a code
  const receipt = { schema: 'donestate.fresh-oauth-acceptance.v1', startedAt: new Date(now).toISOString(), issuer: ORIGIN, resource: RESOURCE, scope: SCOPE, connection: 'new_dynamically_registered_public_client', transport: 'same_origin_https_browser', identityHistory: 'Not established: fresh client consent does not establish first-ever GitHub or DoneState identity.', modelStarts: 0, credentialSetups: 0, repositoryMutations: 0, clientMetadataRetention: 'Non-secret dynamic client registration metadata remains; the provider exposes no public client-delete endpoint.', discoveryPassed: true, callbackStateAndIssuerValidated: true, clientIdSha256: await browserSha256(session.clientId) };
  Object.assign(receipt, await exerciseGrant({ clientId: session.clientId, code, verifier: session.verifier, redirectUri: session.redirectUri }, fetcher));
  receipt.finishedAt = new Date().toISOString();
  return receipt;
}

async function runBrowserPage() {
  const result = document.getElementById('result');
  const start = document.getElementById('start');
  checkBrowser(location.origin === ORIGIN && location.pathname === BROWSER_PATH, 'BROWSER_ORIGIN_MISMATCH');
  const callbackUrl = new URL(location.href);
  const show = (value) => { result.textContent = JSON.stringify(value, null, 2); };
  if (callbackUrl.searchParams.has('code') || callbackUrl.searchParams.has('error')) {
    start.disabled = true;
    result.textContent = 'Checking access, refresh and grant cleanup… Keep this page open.';
    try {
      const receipt = await finishBrowserConsent(callbackUrl, sessionStorage, (url) => history.replaceState(null, '', url));
      show(receipt);
      document.getElementById('status').textContent = receipt.passed ? 'Acceptance passed; the new grant was revoked.' : 'Acceptance incomplete. Keep the result for reconciliation.';
    } catch (error) { show({ passed: false, failure: browserFailure(error), grantOutcome: 'Not established. Do not retry an authorization response.' }); }
    return;
  }
  if (sessionStorage.getItem(SESSION_KEY) !== null) {
    start.disabled = true;
    result.textContent = 'A consent session already exists in this tab. Complete its original GitHub consent; do not replay or replace it.';
    return;
  }
  start.addEventListener('click', async () => {
    start.disabled = true;
    result.textContent = 'Preparing a fresh public client…';
    try { location.assign(await startBrowserConsent(sessionStorage)); }
    catch (error) { show({ passed: false, failure: browserFailure(error), retry: 'Do not repeat an ambiguous registration.' }); }
  }, { once: true });
}
if (typeof document !== 'undefined') runBrowserPage().catch(() => {
  document.getElementById('result').textContent = 'Acceptance page could not start. No success is claimed.';
});

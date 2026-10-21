import { open, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ACCOUNT_ID, AdminError, requireThat, sha256 } from './contracts.mjs';

export async function externalPath(path) {
  requireThat(typeof path === 'string' && isAbsolute(path), 'ABSOLUTE_EXTERNAL_FILE_REQUIRED');
  const parent = await realpath(dirname(path));
  let directory = parent;
  while (true) {
    let git = false;
    try {
      const marker = await stat(join(directory, '.git'));
      // A real checkout has a gitdir file or .git/HEAD; an empty directory is not a repository.
      git = marker.isFile() || (await stat(join(directory, '.git', 'HEAD'))).isFile();
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    requireThat(!git, 'EVIDENCE_MUST_BE_OUTSIDE_GIT_REPOSITORIES');
    if (directory === parse(directory).root) break;
    directory = dirname(directory);
  }
  return join(parent, path.split('/').at(-1));
}

export async function readEvidence(path) {
  requireThat(typeof path === 'string' && isAbsolute(path), 'ABSOLUTE_EXTERNAL_FILE_REQUIRED');
  const safePath = await externalPath(await realpath(path));
  const file = await stat(safePath);
  requireThat(file.isFile() && file.size <= 1024 * 1024, 'INVALID_EVIDENCE_FILE');
  const bytes = await readFile(safePath);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new AdminError('INVALID_EVIDENCE_JSON'); }
  return { value, reference: { path: safePath, sha256: sha256(bytes) } };
}

export async function createReport(path, value) {
  const safePath = await externalPath(path);
  let file;
  try { file = await open(safePath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new AdminError('REPORT_ALREADY_EXISTS_RECONCILE_BEFORE_RETRY'); throw error; }
  await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  await file.sync();
  await file.close();
  const parent = await open(dirname(safePath), 'r');
  await parent.sync();
  await parent.close();
  return async () => {
    const temporary = `${safePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    const next = await open(temporary, 'r');
    await next.sync();
    await next.close();
    await rename(temporary, safePath);
    const parent = await open(dirname(safePath), 'r');
    await parent.sync();
    await parent.close();
  };
}

async function boundedText(response, maximumBytes) {
  const declared = Number(response.headers.get('content-length'));
  requireThat(!Number.isFinite(declared) || declared <= maximumBytes, 'PROVIDER_RESPONSE_TOO_LARGE');
  const reader = response.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) { await reader.cancel(); throw new AdminError('PROVIDER_RESPONSE_TOO_LARGE'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function client({ token, report, persist, fetchImpl = fetch, now = Date.now }) {
  requireThat(typeof token === 'string' && token.trim().length > 0, 'CLOUDFLARE_API_TOKEN_REQUIRED');
  const deadline = now() + 120_000;
  let requests = 0;
  let mutations = 0;
  const cfBase = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects`;
  async function request(url, { method = 'GET', body, provider = false, missing = false, maximumBytes = 4 * 1024 * 1024 } = {}) {
    requireThat(++requests <= 16 && now() < deadline, 'REQUEST_BUDGET_EXHAUSTED');
    const mutation = method !== 'GET';
    requireThat(!mutation || (provider && ++mutations === 1), 'ONE_MUTATION_PER_INVOCATION');
    const entry = { method, url, startedAt: new Date(now()).toISOString() };
    report.requests.push(entry);
    if (mutation) {
      report.phase = 'MUTATION_INTENT';
      report.mutationIntent = { method, url, body: body instanceof FormData ? Object.fromEntries(body.entries()) : body };
      await persist();
    }
    let response;
    try {
      const headers = { Accept: 'application/json' };
      if (provider) headers.Authorization = `Bearer ${token}`;
      if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
      response = await fetchImpl(url, {
        method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        redirect: 'error', signal: AbortSignal.timeout(Math.min(30_000, deadline - now())),
      });
      entry.status = response.status;
      if (missing && response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AdminError('PROVIDER_HTTP_ERROR', { status: response.status, ambiguous: mutation && response.status >= 500 });
      }
      const text = await boundedText(response, maximumBytes);
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new AdminError('PROVIDER_RESPONSE_INVALID_JSON', { ambiguous: mutation }); }
      if (provider) {
        requireThat(parsed.success === true && Object.hasOwn(parsed, 'result'), 'PROVIDER_REJECTED_REQUEST', { ambiguous: mutation });
      }
      entry.responseSha256 = sha256(text);
      return { value: provider ? parsed.result : parsed, envelope: provider ? parsed : undefined, bytes: text };
    } catch (error) {
      entry.failed = true;
      if (error instanceof AdminError) {
        if (mutation && response?.ok) error.details.ambiguous = true;
        throw error;
      }
      throw new AdminError('PROVIDER_TRANSPORT_ERROR', { ambiguous: mutation });
    } finally {
      entry.completedAt = new Date(now()).toISOString();
      await persist();
    }
  }
  return {
    api: (suffix = '', options = {}) => request(`${cfBase}${suffix}`, { ...options, provider: true }),
    publicJson: (url, options = {}) => request(url, options),
  };
}

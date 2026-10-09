import { describe, expect, it } from 'vitest';
import { authHandler, type AuthEnv } from '../src/auth';
describe('hosted browser OAuth acceptance', () => {
  it('serves the canonical page without an account token or external scripts and hides callback input', async () => {
    const response = await authHandler.fetch(new Request('https://donestate.proofandstate.com/acceptance/oauth?code=private-fixture'), {} as AuthEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    const csp = response.headers.get('Content-Security-Policy');
    expect(csp).toContain("script-src 'sha256-");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    const html = await response.text();
    expect(html).toContain('Continue to DoneState and GitHub');
    expect(html).not.toContain('private-fixture');
    expect(html).not.toContain('<script src=');
  });
  it('rejects noncanonical hosts and non-GET methods without registration or provider access', async () => {
    expect((await authHandler.fetch(new Request('https://other.example/acceptance/oauth'), {} as AuthEnv)).status).toBe(404);
    const response = await authHandler.fetch(new Request('https://donestate.proofandstate.com/acceptance/oauth', { method: 'POST' }), {} as AuthEnv);
    expect(response.status).toBe(405); expect(response.headers.get('Allow')).toBe('GET');
  });
});

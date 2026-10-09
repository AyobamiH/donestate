import { GA_OAUTH_HTML, GA_OAUTH_SCRIPT_HASH, GA_OAUTH_STYLE_HASH } from './ga-oauth-assets';

export function gaOAuthPage(request: Request): Response {
  const url = new URL(request.url);
  if (url.origin !== 'https://donestate.proofandstate.com') return new Response('Not found', { status: 404 });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
  return new Response(GA_OAUTH_HTML, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${GA_OAUTH_SCRIPT_HASH}'; style-src 'sha256-${GA_OAUTH_STYLE_HASH}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  } });
}

import { DONESTATE_UI_CSS } from "./ui";

// Content is server-rendered markup. Callers must escape interpolated values.
export function renderAccountDocument(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${DONESTATE_UI_CSS}</style></head><body><a class="skip-link" href="#account">Skip to account</a><header class="topbar"><nav class="topbar-inner" aria-label="Product"><a class="brand-lockup" href="/" aria-label="DoneState home"><span class="brand-mark" aria-hidden="true">DS</span><span class="brand-copy"><span class="eyebrow">Proof &amp; State</span><span class="brand-name">DoneState</span></span></a><a class="topbar-link" href="https://proofandstate.com/docs/donestate">Documentation</a></nav></header><main id="account" class="settings-page"><div class="settings-card">${content}</div></main></body></html>`;
}

export function accountNextSteps(): string {
  return `<section class="settings-section"><h2>What happens next?</h2><p>You can close this tab and return to your MCP client. To open your account again, ask DoneState for a fresh account-settings link.</p><div class="actions"><a class="button" href="/">DoneState home</a><a class="button secondary" href="https://proofandstate.com/docs/donestate">Read the documentation</a></div></section>`;
}

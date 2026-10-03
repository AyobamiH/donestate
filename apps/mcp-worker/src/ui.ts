export const DONESTATE_UI_CSS = `
:root {
  color-scheme: light;
  --canvas: #f4f4f0;
  --paper: #ffffff;
  --surface: #fafaf7;
  --surface-active: #ecece6;
  --ink: #1b1d1a;
  --muted: #62675f;
  --line: #d9dcd4;
  --line-strong: #bcc1b7;
  --primary: #171815;
  --on-primary: #f6f6f0;
  --verified: #1f7650;
  --verified-soft: #e7f5ed;
  --warning: #8b6400;
  --warning-soft: #fff5d8;
  --danger: #aa3d33;
  --danger-soft: #fcecea;
  --focus: #3f63f4;
  --radius-sm: 8px;
  --radius: 12px;
  --shadow: 0 18px 50px -38px rgba(27, 29, 26, 0.5);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { background: var(--canvas); color: var(--ink); -webkit-font-smoothing: antialiased; }
body { margin: 0; min-height: 100vh; background: var(--canvas); color: var(--ink); }
a { color: inherit; }
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
code, .mono, .eyebrow, .status-label, .step-index {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.site-shell { min-height: 100vh; }
.topbar {
  min-height: 64px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.86);
}
.topbar-inner {
  width: min(1180px, calc(100% - 40px));
  min-height: 64px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.brand-lockup { display: flex; align-items: center; gap: 12px; text-decoration: none; }
.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 750;
  letter-spacing: -0.04em;
}
.brand-copy { display: grid; gap: 1px; }
.eyebrow {
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.brand-name { font-size: 16px; line-height: 22px; font-weight: 700; letter-spacing: -0.02em; }
.topbar-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--paper);
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
}
.page {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: 56px 0 72px;
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(320px, 0.78fr);
  gap: 48px;
  align-items: start;
}
.hero-copy { max-width: 720px; }
.kicker {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
h1, h2, h3, p { margin-top: 0; }
h1 {
  margin-bottom: 20px;
  max-width: 760px;
  font-size: clamp(38px, 5vw, 62px);
  line-height: 1.02;
  letter-spacing: -0.055em;
  font-weight: 720;
}
h2 {
  margin-bottom: 10px;
  font-size: 22px;
  line-height: 30px;
  letter-spacing: -0.03em;
  font-weight: 700;
}
h3 {
  margin-bottom: 6px;
  font-size: 16px;
  line-height: 24px;
  font-weight: 700;
}
.lede {
  max-width: 680px;
  margin-bottom: 28px;
  color: var(--muted);
  font-size: 18px;
  line-height: 29px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0 0 32px;
}
.button {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--on-primary);
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
  text-decoration: none;
}
.button.secondary {
  border-color: var(--line-strong);
  background: var(--paper);
  color: var(--ink);
}
.button.danger {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
}
.endpoint {
  max-width: 680px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.endpoint-label {
  display: block;
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
  font-weight: 650;
}
.endpoint code {
  display: block;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 22px;
}
.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: var(--shadow);
}
.panel-inner { padding: 24px; }
.status-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.status-heading h2 { margin-bottom: 0; font-size: 18px; line-height: 26px; }
.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--verified-soft);
  color: var(--verified);
  font-size: 12px;
  font-weight: 750;
}
.status-list { margin: 0; padding: 0; list-style: none; }
.status-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  padding: 17px 0;
  border-bottom: 1px solid var(--line);
}
.status-row:last-child { border-bottom: 0; padding-bottom: 0; }
.status-label {
  color: var(--muted);
  font-size: 11px;
  line-height: 18px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.status-value { font-size: 14px; line-height: 20px; font-weight: 700; text-align: right; }
.status-value.live { color: var(--verified); }
.status-value.review { color: var(--warning); }
.section {
  margin-top: 48px;
  padding-top: 40px;
  border-top: 1px solid var(--line);
}
.section-heading {
  max-width: 700px;
  margin-bottom: 22px;
}
.section-heading p {
  margin-bottom: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 24px;
}
.workflow {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  overflow: hidden;
}
.step {
  min-height: 170px;
  padding: 24px;
  border-right: 1px solid var(--line);
}
.step:last-child { border-right: 0; }
.step-index {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
}
.step p { margin-bottom: 0; color: var(--muted); font-size: 14px; line-height: 22px; }
.boundary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 28px;
  align-items: center;
  padding: 24px;
  border: 1px solid var(--line);
  border-left: 4px solid var(--verified);
  border-radius: var(--radius);
  background: var(--surface);
}
.boundary p { margin-bottom: 0; color: var(--muted); font-size: 14px; line-height: 22px; }
.boundary strong { color: var(--ink); }
.boundary-note {
  max-width: 300px;
  color: var(--verified);
  font-size: 13px;
  line-height: 20px;
  font-weight: 700;
  text-align: right;
}
.settings-page {
  width: min(840px, calc(100% - 40px));
  margin: 0 auto;
  padding: 48px 0 72px;
}
.settings-card {
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: var(--shadow);
}
.settings-intro { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.settings-intro h1 { margin-bottom: 10px; font-size: 30px; line-height: 38px; letter-spacing: -0.035em; }
.settings-intro p { margin-bottom: 0; color: var(--muted); }
.settings-section { padding: 28px 0; border-bottom: 1px solid var(--line); }
.settings-section:last-child { border-bottom: 0; padding-bottom: 0; }
.settings-section p { color: var(--muted); line-height: 24px; }
.settings-section > p:last-child { margin-bottom: 0; }
.field-label {
  display: block;
  margin: 18px 0 8px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
}
input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--paper);
  color: var(--ink);
  font: inherit;
}
button {
  min-height: 44px;
  margin-top: 16px;
  padding: 0 18px;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--on-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button.danger { border-color: var(--danger); background: var(--danger); color: #fff; }
.muted { color: var(--muted); }
.notice {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.list li {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  line-height: 22px;
}
.list li:last-child { border-bottom: 0; }

.settings-card { overflow-wrap: anywhere; line-height: 1.5; }
.account-nav { display:flex; flex-wrap:wrap; gap:8px 16px; }
.account-nav a { display:inline-flex; min-height:44px; align-items:center; }
.skip-link { position:absolute; left:16px; top:-100px; padding:12px; background:var(--paper); z-index:2; }
.skip-link:focus { top:8px; }
summary { min-height:44px; cursor:pointer; padding:8px 0; }
summary:focus-visible { outline:2px solid var(--focus); outline-offset:3px; }
summary code { display:block; margin-top:8px; font-size:12px; }
.run-state { display:inline-block; margin-left:12px; padding:2px 8px; background:var(--surface-active); border-radius:4px; }
.objective-detail { margin-top:12px; border-top:1px solid var(--line); padding-top:16px; }
.objective-detail pre { white-space:pre-wrap; overflow-wrap:anywhere; padding:12px; background:var(--surface); }
.objective-detail a { display:inline-flex; min-height:44px; align-items:center; }
.danger-zone { margin-top:24px; border-top:2px solid var(--danger); }
@media(max-width:480px) { .run-state { display:table; margin:8px 0; } }
.success-card {
  width: min(640px, calc(100% - 40px));
  margin: 10vh auto;
  padding: 32px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: var(--shadow);
}
.success-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  margin-bottom: 22px;
  border-radius: 50%;
  background: var(--verified-soft);
  color: var(--verified);
  font-weight: 800;
}
.success-card h1 { margin-bottom: 12px; font-size: 30px; line-height: 38px; }
.success-card p { color: var(--muted); line-height: 24px; }
.footer {
  margin-top: 56px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  color: var(--muted);
  font-size: 13px;
  line-height: 20px;
}
.footer a { text-underline-offset: 3px; }
@media (max-width: 820px) {
  .topbar-inner, .page, .settings-page { width: min(100% - 32px, 1180px); }
  .page { padding-top: 36px; }
  .hero { grid-template-columns: 1fr; gap: 28px; }
  .workflow { grid-template-columns: 1fr; }
  .step { min-height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .step:last-child { border-bottom: 0; }
  .boundary { grid-template-columns: 1fr; }
  .boundary-note { max-width: none; text-align: left; }
}
@media (max-width: 520px) {
  .topbar-inner { min-height: 60px; }
  .topbar-link { display: none; }
  .page, .settings-page { width: calc(100% - 32px); padding-bottom: 48px; }
  h1 { font-size: 38px; }
  .actions { display: grid; }
  .button { width: 100%; }
  .panel-inner, .settings-card { padding: 20px; }
  .status-row { grid-template-columns: 1fr; gap: 4px; }
  .status-value { text-align: left; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; }
}
`;

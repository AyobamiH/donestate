# DoneState design system

Status: owned-service UI specification, 2 October 2026.

This document defines the visual and interaction contract for DoneState browser surfaces. It is informed by the Google Labs DESIGN.md method and grounded in the current Proof & State visual system. It does not change DoneState runtime authority, MCP tool metadata, OAuth scopes, verification semantics, or provider-review state.

## 1. Product character

DoneState should feel like governed infrastructure made understandable: calm, precise, restrained and evidence-led.

The browser UI is not a marketing microsite pasted onto an MCP server. The root page, OAuth consent, credential/account settings, success states and provider-development surfaces should read as one product family.

Use hierarchy, alignment and state labels to organise information. Decorative treatments stay quiet. Evidence and consequence boundaries remain explicit.

## 2. Foundation tokens

The owned service follows the parent Proof & State material language.

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#f4f4f0` | Page background |
| Paper | `#ffffff` | Primary panels |
| Surface | `#fafaf7` | Supporting summaries and technical values |
| Surface active | `#ecece6` | Quiet active/background state |
| Ink | `#1b1d1a` | Primary text |
| Muted | `#62675f` | Supporting text |
| Hairline | `#d9dcd4` | Dividers and panel borders |
| Hairline strong | `#bcc1b7` | Inputs and stronger boundaries |
| Primary | `#171815` | Primary action |
| On primary | `#f6f6f0` | Text on primary |
| Verified | `#1f7650` | Verified/live semantic state only |
| Verified soft | `#e7f5ed` | Verified/live container |
| Warning | `#8b6400` | Review/pending semantic state |
| Warning soft | `#fff5d8` | Review/pending container |
| Danger | `#aa3d33` | Destructive or failure state |
| Danger soft | `#fcecea` | Destructive/failure container |
| Focus | `#3f63f4` | Keyboard focus |

Colour is semantic. Do not use verified green to imply a provider listing is approved or a repository change is independently verified when it is not.

## 3. Typography

Use system sans-serif fonts only on the Worker-owned surface. External font loading is intentionally unnecessary.

- Page title: 38–62px on the public root; 30–38px on settings/task screens.
- Section heading: 20–22px.
- Body: 16px with approximately 24px line height.
- Supporting metadata: 13–14px.
- Eyebrow/status labels: 11–12px monospace, uppercase where useful.
- Technical identifiers and endpoints: monospace.

Use one page title per view. Avoid giant decorative type on working settings screens.

## 4. Spacing and shape

Use a 4px base scale with 8, 12, 16, 24, 32 and 48px steps.

- Minimum interactive height: 44px.
- Button/input radius: 8px.
- Panel radius: 12px.
- Desktop panel padding: 24–32px.
- Mobile panel padding: 20px.
- Main useful width: approximately 1180px on the root and 840px on account/settings tasks.

Open space should frame useful content, not create an empty half-page.

## 5. Shared components

### Brand header

Every human-facing production page should use the compact Proof & State / DoneState lockup. Keep one navigation action on the right when useful. The header is functional, not ornamental.

### Buttons

Use one visually dominant action per task. Secondary actions use paper background and a strong hairline. Destructive actions are isolated and red.

Action labels describe the consequence: **Set up DoneState**, **Verify and connect**, **Delete indexed DoneState account data**.

### Panels

Use a panel for a meaningful group, not for every sentence. White surfaces receive a fine border and quiet shadow. Supporting technical values may use the pale surface background.

### Status

Status always includes text. Separate these dimensions explicitly:

- owned service availability;
- OpenAI provider review;
- GitHub Marketplace provider review;
- repository execution state;
- independent verification state.

A live service is not the same claim as an approved directory listing or a VERIFIED repository outcome.

## 6. Root-page information order

The root page should answer four questions in the first screen:

1. What is DoneState?
2. What can I do next?
3. What endpoint do I connect?
4. What is actually live versus still under external review?

Below that, show the three-step mental model:

**Connect → Authorise → Review proof**

Then state the authority boundary prominently: DoneState can execute and publish reviewable work, but it does not own final merge authority and does not treat its own execution as proof.

Do not expose implementation trivia ahead of the user task.

## 7. Account settings

Account controls remain a focused task surface.

Group:
1. execution credential;
2. repository access;
3. known objectives;
4. account-data deletion.

Keep deletion visually separate and preserve its explicit confirmation and active-run refusal. Design changes must not weaken generation fencing, stale-write protection, durable retry behaviour or the documented legacy-erasure limitation.

## 8. Responsive behaviour

At widths below roughly 820px:

- stack root hero content and status;
- stack workflow steps vertically;
- keep 16px page gutters;
- keep form controls at least 44px high;
- avoid horizontal overflow;
- let long repository names and identifiers wrap.

At approximately 390px width, primary and secondary root actions may span the available width.

At 200% zoom, content must remain readable without clipped controls or overlapping actions.

## 9. Accessibility and interaction

- Visible keyboard focus uses the focus token.
- Semantic headings remain in order.
- Status is never conveyed by colour alone.
- Form inputs keep persistent labels.
- Destructive controls retain explicit confirmation text.
- Reduced-motion preferences are respected.
- Root and settings pages require no client-side JavaScript to remain usable.

## 10. Acceptance

For browser-surface changes:

- preserve the frozen OpenAI-reviewed MCP tool inventory unless a deliberate new provider version is authorised;
- preserve OAuth and CSP safety boundaries;
- pass exact-head Worker tests and plugin validation;
- inspect the root at 390, 768, 1280 and 1920px widths where browser tooling is available;
- inspect account settings, success, empty, validation and deletion states;
- confirm provider status copy does not overclaim publication;
- confirm no visual change changes repository authority, verification semantics or deletion guarantees.

Screenshots and a green build are not sufficient evidence for execution or verification behaviour; those remain separate operational proofs.

## Implementation source

The Worker-owned token implementation lives in `apps/mcp-worker/src/ui.ts`. Proof & State's parent frontend remains the higher-level brand reference; DoneState intentionally uses system fonts so the Worker surface stays self-contained under its restrictive CSP.

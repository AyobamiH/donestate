# Owned-domain launch acceptance

The publisher authorised work on fresh signup/OAuth and broader GA on 9 October 2026. The completed selected-App execution, independent verification, customer-state deletion, temporary Write removal and live policy acceptance remain recorded in E-109. Customer PR 177 stays unmerged.

## Fresh signup/OAuth

DoneState onboarding is GitHub-backed OAuth consent. There is no separate registration form. A new client must discover the canonical issuer, register its callback, use S256 PKCE, complete DoneState and GitHub consent, exchange the code, and access the MCP service using its own new grant.

Run the reviewed helper on the computer where the customer will sign in:

```sh
node scripts/ga-oauth.mjs --receipt ga-oauth-acceptance.json
```

Open the local page printed by the helper and complete GitHub consent in your own browser. Keep the terminal open. Use the intended customer account with no connected DoneState execution key. Never paste a password, API key, callback URL, authorization code or token into chat.

The helper binds only to `127.0.0.1`, validates callback state and issuer, consumes a callback once, checks authenticated read-only MCP access and absent execution credentials, exercises token refresh, and revokes only its new client grant. It then requires HTTP 401 for that revoked access token. Tokens remain in process memory. The receipt contains only whitelisted results and a client-ID hash. The provider retains non-secret client registration metadata; its public API has no client-delete endpoint. An ambiguous exchange or failed cleanup is a failed acceptance, with no automatic mutation retry.

This proves first authorization for a newly registered client. It does not establish that the GitHub identity has never used DoneState before. Existing authenticated ChatGPT connections, reviewer login, metadata discovery and an already completed coding run cannot substitute for the new consent/code/token round trip.

## Production and support evidence

`GA production preflight` runs after a successful main-branch hosted Worker deployment, after an observer update on main, or by manual dispatch. It checks the canonical public onboarding endpoints and expected authorization rejections. Using the existing protected provider capability, it reads deployment and cron state. It first queries stored natural scheduled logs from the current deployment, scoped to DoneState and the aggregate sweep message with no query persistence. If no qualifying stored event is available, it opens one temporary live-log session, waits up to 65 minutes for an actual hourly scheduled sweep, then deletes that session. It never invokes the cron, changes schedules or deploys a Worker.

Only the scheduled timestamp, Worker version when supplied, deployment identities and aggregate Marketplace health are published. Request URLs, account/repository data, secrets and unrelated logs are discarded. A healthy result requires zero unresolved recent failures, no escalation, successful invocation and an unchanged deployment during observation. A failed result keeps OPS-002 open and enters the incident runbook.

The support drill in `evidence/ga-20261009/support-drill.json` exercises the published runbook against a hypothetical webhook failure. Public issues handle non-confidential availability/support reports; the private advisory route handles security-sensitive material. The drill proves procedural routing and recovery decisions. It does not prove delivery of a customer report, inbox monitoring, a real provider notification, 24/7 staffing or a recovery-time guarantee.

## Release decision

| Gate | Evidence required | Current state before live handoff |
| --- | --- | --- |
| Selected-App objective and cleanup | E-109 exact run, PR head, verifier and removal receipts | Complete |
| Policy and public-location acceptance | E-103/E-105 exact live wording | Complete |
| Fresh client signup/OAuth | New helper receipt with consent, code exchange, MCP access, refresh and scoped revocation | Awaiting customer consent |
| Production prerequisites | Exact deployed source plus canonical HTTP receipt | Complete: PR 179, Worker `164602a6-35a5-464a-ac70-1ffd00a01066`, all public probes passed |
| Natural Marketplace health | Successful scheduled sweep receipt, no recent unresolved failures or escalation | Complete: E-113, natural sweep at `2026-10-09T15:00:26Z`, no unresolved failures; deployment unchanged |
| Support procedure | Bounded tabletop receipt and visible support/policy links | Drill complete; live customer delivery not claimed |
| Initial owned-domain access | Publisher authority, bounded objective controls, support and stop criteria | Approved preparation; fresh OAuth and runtime gates still apply |
| Unrestricted owned-domain GA | Separately recorded publisher decision against the completed gates and accepted residual risks | Not declared |

The first owned-domain cohort uses explicit per-objective authority, customer-held execution credentials and independent verification for consequential outcomes. Observe the existing anonymous aggregate funnel and manually record support load and repeat use without publishing customer identifiers. Stop admitting new work if OAuth fails, deletion regresses, authority becomes ambiguous, independent verification cannot complete or Marketplace health escalates; contain the narrow affected path under `docs/INCIDENT-RESPONSE.md`.

The publisher owns support escalation and the final GA decision. Review the first cohort within seven days of entry and record the decision and measurements. No customer invitation, support message, external listing publication or new model execution is sent by this acceptance tooling. OpenAI directory and GitHub Marketplace review/publication remain separate channel states.

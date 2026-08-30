# Owned-domain cutover evidence

Observed: 2026-08-30

## Outcome

DoneState's canonical hosted service is `https://donestate.proofandstate.com`, with MCP at `https://donestate.proofandstate.com/mcp`. The original `workers.dev` transport remains enabled only for OpenAI directory version 0.2.0 while that immutable submission is in Review.

## Source and deployment chain

- implementation PR: [#38](https://github.com/AyobamiH/donestate/pull/38)
- merge commit: [`c69896d06f1a490ab1f67606fd0d406ab826191b`](https://github.com/AyobamiH/donestate/commit/c69896d06f1a490ab1f67606fd0d406ab826191b)
- pull-request CI: [33299986374](https://github.com/AyobamiH/donestate/actions/runs/33299986374) — success
- post-merge CI: [33300648343](https://github.com/AyobamiH/donestate/actions/runs/33300648343) — success
- deployment: [33300648341](https://github.com/AyobamiH/donestate/actions/runs/33300648341) — success
- deployment job: `99228025051`
- Cloudflare version: `11018054-685f-4e7e-ab6b-f30817b2d89f`

The deployment log records both `donestate.proofandstate.com (custom domain)` and the compatibility Worker URL. It also records `CANONICAL_ORIGIN=https://donestate.proofandstate.com`.

## Owner-side GitHub settings

- OAuth App homepage: `https://donestate.proofandstate.com`
- exact canonical OAuth callback: `https://donestate.proofandstate.com/callback`
- compatibility callback retained: `https://donestate-mcp.woeinvests.workers.dev/callback`
- private GitHub App: `donestate-maintenance-ayobamih`, App ID `4761698`
- GitHub App homepage: `https://donestate.proofandstate.com`
- webhook: `https://donestate.proofandstate.com/webhooks/github`, active with SSL verification
- installation: `157513439`, **Only select repositories**, only `AyobamiH/donestate`

No application secret, private key, repository permission, installation scope, or merge authority changed during the domain cutover.

## Live read-only observations

| Surface | Observation |
| --- | --- |
| `/` | HTTP 200; DoneState MCP identity page |
| `/.well-known/openai-apps-challenge` | HTTP 200; response value not copied into evidence |
| `/mcp` without a bearer token | HTTP 401; advertises canonical protected-resource metadata |
| `/.well-known/oauth-protected-resource/mcp` | HTTP 200; resource is `https://donestate.proofandstate.com/mcp` |
| `/.well-known/oauth-authorization-server` | HTTP 200; canonical authorize, token, registration, and revocation endpoints |
| `/webhooks/github` with GET | HTTP 405, confirming the POST-only route exists without delivering a webhook |

## Truth boundary

This evidence does not rerun the already verified historical canary `631d8a08-d337-4bae-bd18-b55c31f48a8b`. It also does not upgrade the fresh maintenance canary: run `b4242932-0bc1-4876-a202-634d9c12d72a` remains `AWAITING_VERIFICATION` because the independent OpsTruth decision remains `uncertain`; PR #22 remains open and unmerged.

OpenAI directory version 0.2.0 remains in Review. The domain cutover is deployment evidence, not OpenAI approval or publication evidence.

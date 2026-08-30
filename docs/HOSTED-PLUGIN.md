# Hosted ChatGPT plugin preview

DoneState 0.2 introduces a hosted MCP execution plane and a ChatGPT plugin package. It is a deployed preview, not a published or production-certified service.

Hosted endpoint: `https://donestate-mcp.woeinvests.workers.dev/mcp`

The Worker and Container application are deployed. Public reachability, OAuth protection, authenticated GitHub OAuth, user-funded OpenAI credential setup, an end-to-end pull-request objective, and the independent OpsTruth v2 round trip have been verified. GitHub App maintenance must now pass its own deployed canary before directory submission.

## What the hosted slice does

1. ChatGPT turns a prose outcome into one objective and grouped authority envelope.
2. GitHub OAuth identifies the operator and grants access to public repositories.
3. A Durable Object owns one run, its state transitions, encrypted run credential, action intents, settlements and hash-chained events.
4. The user connects their own OpenAI API key through a single-use HTTPS setup page. The key is encrypted in a per-user Durable Object and never enters ChatGPT tool arguments.
5. A Cloudflare Sandbox clones the pinned public base commit without a GitHub credential and runs a pinned Codex CLI without interactive approval using that user's key.
6. Deterministic code installs locked Node dependencies when applicable, validates the diff, enforces the changed-file budget and creates a commit.
7. Only then does the sandbox receive the GitHub credential for the exact branch push. Credentials are removed immediately and the per-run container is destroyed.
8. DoneState seals a v2 verification handoff containing the exact base/head subject, verification nonce, acceptance-criterion coverage, action idempotency/result bindings and event-chain head, then stops at `AWAITING_VERIFICATION`.
9. OpsTruth independently re-observes the exact public commit and evaluates only the sealed machine-checkable requirements.
10. Only a fresh v2 Ed25519 attestation from the pinned independent verifier can produce `VERIFIED`.

The MCP surface also contains `get_openai_credential_status`, `create_openai_credential_setup` and `delete_openai_credential`. The setup link expires after ten minutes and is single-use. The execution surface contains `create_objective`, `start_objective`, `get_objective`, `cancel_objective`, `delete_objective`, `create_verification_handoff` and `submit_verifier_attestation`.

## Authentication and OpenAI review access

Normal users choose **Continue with GitHub**. When GitHub enters Confirm access or sudo mode inside Cloud Browser, use **your password** or **your authenticator app**. Do not choose a passkey: Cloud Browser does not support WebAuthn/passkey confirmation.

The consent page also exposes a dedicated OpenAI reviewer test account. Its high-entropy password is supplied only through the OpenAI review portal; the repository contains only its SHA-256 digest. This account uses the owner’s already selected GitHub App installation for sample-repository reads and sets `reviewMode: true`. The server rejects every credential, repository-selection, execution, cancellation, deletion, handoff, attestation, and verification mutation for that identity with `BLOCKED_AUTHORITY`. It can only inspect configuration, selected repositories, maintenance evidence, and existing run evidence.

## Authority boundary

| Publication | Required authorities |
|---|---|
| Branch | `local_read`, `local_write`, `test`, `commit`, `push`, `secret_access` |
| Pull request | Branch authorities plus `open_pr` |

The current OAuth preview requests GitHub's `public_repo` and `read:user` scopes. Private repositories are rejected as `BLOCKED_CAPABILITY`. They should use short-lived GitHub App installation tokens before production support is enabled.

Remote mutations use durable intent records and provider probes. If a branch push or pull-request creation cannot be reconciled to the intended commit, the run stops at `AMBIGUOUS_EFFECT`; the mutation is not blindly replayed.

## Deployment prerequisites

- a Cloudflare account capable of Workers, Durable Objects, Containers and the Sandbox SDK
- a GitHub OAuth App
- an OpenAI API account and key for each user who runs the isolated coding harness
- a stable HTTPS Worker hostname

From `apps/mcp-worker`:

```bash
npm ci
npx wrangler kv namespace create OAUTH_KV
```

Put the returned namespace ID in the `OAUTH_KV` entry in `wrangler.jsonc`. Configure the GitHub OAuth App callback as:

```text
https://YOUR_WORKER_HOST/callback
```

Create the Worker secrets without committing their values:

```bash
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put USER_CREDENTIAL_ENCRYPTION_KEY
```

The hosted GitHub Actions deployment reads `DONESTATE_GITHUB_CLIENT_ID` and `DONESTATE_GITHUB_CLIENT_SECRET` from repository Actions secrets, maps them to the Worker's `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` bindings, and fails before deployment when either is absent. This keeps every later deployment attached to the same upstream OAuth application without using ambiguous repository-secret names.

`TOKEN_ENCRYPTION_KEY` and `USER_CREDENTIAL_ENCRYPTION_KEY` must each be a different base64-encoded 32-byte value. Suitable values can be generated with `openssl rand -base64 32`. Use another separate high-entropy value for `COOKIE_ENCRYPTION_KEY`.

The default hosted limits allow one active objective and ten started objectives per UTC day for each authenticated GitHub user. Cloudflare also caps this deployment at five simultaneous Sandbox containers. Change `USER_DAILY_RUN_LIMIT` deliberately and retain a hard global container cap.

Then run:

```bash
npm run check
npm run deploy:check
npm run deploy
```

After deployment, replace the local URL in `plugins/donestate/.mcp.json` with the exact HTTPS MCP endpoint:

```json
{
  "mcpServers": {
    "donestate": {
      "type": "http",
      "url": "https://YOUR_WORKER_HOST/mcp"
    }
  }
}
```

The server supports client ID metadata documents with dynamic client registration as a compatibility fallback, so the plugin does not embed a client secret. Every tool call also enforces the `donestate:execute` OAuth scope in addition to the per-objective consequence envelope.

## Publication gates

Before submitting the plugin to the universal ChatGPT and Codex directory:

- deploy the Worker to its stable hostname
- verify OAuth login, consent, execution, cancellation and deletion through the hosted client
- verify OpenAI credential connection, replacement, quota enforcement and deletion without placing a key in ChatGPT
- retain the completed public-repository branch and pull-request canary evidence
- test crash recovery at every remote mutation boundary
- retrieve the independent OpsTruth verifier identity, pin its DoneState-compatible fingerprint and prove one synthetic plus one live v2 round trip
- publish and review the privacy policy and terms at the manifest URLs
- replace the local MCP URL and validate the plugin archive
- complete threat modelling, incident response, rate limits, abuse controls and retention controls

## Owner-activated, independent verification pending

The private GitHub App `donestate-maintenance-ayobamih` is configured and installed with Only select repositories on only `AyobamiH/donestate`. Installation `157513439` supplies short-lived App tokens for the PR-only maintenance path. Automatic repair and scheduling are enabled with required checks `core (22)`, `core (24)`, and `hosted-plugin`.

The canonical fresh canary is run `b4242932-0bc1-4876-a202-634d9c12d72a` and pull request #22 at head `ffec48e6c5abd9cef840ab591896613769d3e779`. The App created the branch, commit, and PR; local validation passed; GitHub workflow `33260424569` shows all three required checks successful. The pull request remains intentionally open because the App has no merge authority.

OpsTruth observed the exact head, comparison, and required job URLs but signed `uncertain`. DoneState correctly remains `AWAITING_VERIFICATION`; the verifier decision defect is tracked in `AyobamiH/opstruth#12`. Until a corrected signed decision is accepted, the owner-side canary must not be described as independently verified.

DoneState still does not implement merge queues, autonomous deployment or package publication, multi-repository objectives, hardware-backed verifier-key custody, external event anchoring, or fleet SLOs. These remain gated work and must not be implied by the plugin listing.

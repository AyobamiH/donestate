# Hosted ChatGPT plugin preview

DoneState 0.2 introduces a hosted MCP execution plane and a ChatGPT plugin package. It is a deployment-ready preview, not a published or production-certified service.

## What the hosted slice does

1. ChatGPT turns a prose outcome into one objective and grouped authority envelope.
2. GitHub OAuth identifies the operator and grants access to public repositories.
3. A Durable Object owns one run, its state transitions, encrypted run credential, action intents, settlements and hash-chained events.
4. The user connects their own OpenAI API key through a single-use HTTPS setup page. The key is encrypted in a per-user Durable Object and never enters ChatGPT tool arguments.
5. A Cloudflare Sandbox clones the pinned public base commit without a GitHub credential and runs a pinned Codex CLI without interactive approval using that user's key.
6. Deterministic code installs locked Node dependencies when applicable, validates the diff, enforces the changed-file budget and creates a commit.
7. Only then does the sandbox receive the GitHub credential for the exact branch push. Credentials are removed immediately and the per-run container is destroyed.
8. DoneState seals a verification handoff and stops at `AWAITING_VERIFICATION`.
9. Only a pinned Ed25519 attestation from an independent verifier can produce `VERIFIED`.

The MCP surface also contains `get_openai_credential_status`, `create_openai_credential_setup` and `delete_openai_credential`. The setup link expires after ten minutes and is single-use. The execution surface contains `create_objective`, `start_objective`, `get_objective`, `cancel_objective`, `delete_objective`, `create_verification_handoff` and `submit_verifier_attestation`.

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
- run an end-to-end public-repository branch and pull-request canary
- test crash recovery at every remote mutation boundary
- connect a genuinely independent attestation signer and pin its public-key fingerprint
- publish and review the privacy policy and terms at the manifest URLs
- replace the local MCP URL and validate the plugin archive
- complete threat modelling, incident response, rate limits, abuse controls and retention controls

## Explicitly incomplete capabilities

The preview does not yet implement private repositories, GitHub App installation tokens, merge queues, deployment or package publication, scheduled maintenance, a global queue, repository leases, multi-repository objectives, managed verifier keys, external event anchoring or fleet SLOs. These remain roadmap work and must not be implied by the plugin listing.

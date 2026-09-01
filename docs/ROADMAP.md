# Roadmap

Milestone themes live here; the executable recovery order and every active, blocked, planned, deferred, or complete item live in the generated [Project state](PROJECT-STATE.md). Deferred work must have a named re-entry condition there and is never silently removed.

## 0.1: durable local control plane

- Prose-first Codex path and explicit objective/policy path.
- Standing consequence authority.
- SQLite state, leases, fencing and tamper-evident events.
- No-shell bounded process adapter.
- Crash-safe ambiguity handling.
- Signed independent verification handoff.

## 0.2: provider transactions

- ChatGPT and Codex plugin control surface with prose-first objective skills. Deployed; directory version 0.2.0 submitted and in OpenAI Review.
- OAuth 2.1 MCP transport, durable hosted run coordination and isolated Codex execution. Deployed and canary-verified for the public-repository path.
- Exact-head branch push and pull-request actions with durable effect probes. Deployed and canary-verified for the public-repository path.
- First-class AgentProof repository-patch adapter.
- GitHub App manifest setup, encrypted credentials and short-lived selected-repository installation tokens. Deployed and owner-activated for only `AyobamiH/donestate`; the PR-only maintenance canary remains `AWAITING_VERIFICATION` until OpsTruth has an authenticated exact-head read lane.
- Merge-queue action with exact-head preconditions.
- Native Pi and OpenClaw session metadata adapters.
- Automatic independent OpsTruth attestation request and pinned signer acceptance. Deployed; the maintenance-path canary is `AWAITING_VERIFICATION` on the authenticated GitHub read-lane blocker in `AyobamiH/opstruth-chatgpt-plugin#11`.

## 0.3: autonomous maintenance

- Durable objective queue with deduplication and priority lanes.
- Admission backpressure and repository leases.
- Semantic findings, patch attempts, targeted repair and separate revalidation.
- Selected-repository registry, signed webhooks, six-hour discovery schedule and PR-only labeled-issue repair. Deployed and activated for one selected repository. The owner later merged canary PR #22 outside DoneState's PR-only authority; the run still awaits independent verification.
- Broader drift reconciliation and global priority lanes remain pending.

## 0.4: managed execution plane

- Hosted workers with strong workload isolation.
- Secret broker and workload identity.
- Multi-repository objectives and policy inheritance.
- Managed verifier key registry and external event anchoring.
- Production SLOs, fleet observability and controlled rollout policies.

CrabBox and ClawPatch are deferred provider adapters. They may be added only after recorded evidence shows Cloudflare Sandbox and direct Codex execution cannot satisfy a named requirement. Multi-repository and fleet authority remains last.

The version numbers are product milestones, not promises of dates. "Deployed" means code reached the production Worker; it does not imply that an unconfigured provider path or unpassed canary is production-verified. Security and independent-verification invariants remain release gates.

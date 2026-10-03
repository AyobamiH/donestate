# CLI and hosted MCP capability reconciliation

Status: active implementation record for CLI-002, 3 October 2026.

DoneState is one control-plane model with multiple interfaces. The CLI is a first-class interface for humans and agents; the hosted MCP service is a remote multi-user interface. Capability parity means that a user choosing the CLI should not lose a consequence capability merely because nobody wired it into the CLI. It does **not** mean copying hosted infrastructure onto a laptop.

## Classification rule

A capability belongs in the CLI when it can operate safely from a local owner environment using explicit objective authority, local durable state, and existing local provider authentication.

A capability stays hosted-only when its purpose is multi-user service identity, hosted credential custody, Cloudflare runtime allocation, provider-review identity, Marketplace lifecycle, or hosted account indexing.

## Current matrix

| Hosted MCP capability | CLI status | Classification |
| --- | --- | --- |
| get_openai_credential_status | not applicable | hosted-only credential-vault state |
| create_openai_credential_setup | not applicable | hosted-only browser/vault setup |
| delete_openai_credential | not applicable | hosted-only vault deletion |
| get_github_app_status | not applicable | hosted-only GitHub App administration |
| create_github_app_setup | not applicable | hosted-only GitHub App administration |
| select_maintenance_repository | no direct equivalent | hosted registry/scheduler concern |
| list_maintenance_repositories | no direct equivalent | hosted registry/scheduler concern |
| remove_maintenance_repository | no direct equivalent | hosted registry/scheduler concern |
| discover_maintenance_work | pending | portable maintenance capability |
| list_maintenance_findings | pending | portable maintenance capability |
| start_maintenance_repair | pending | portable bounded-repair capability |
| create_objective | `create` / `run` / `go` | portable and available |
| start_objective | `start` | portable and available |
| get_objective | `status` | portable and available |
| cancel_objective | `cancel` | portable and available |
| delete_objective | `delete --confirm` | portable and available |
| create_verification_handoff | `handoff` | portable; local v1 exists, v2 published-subject parity remains |
| submit_verifier_attestation | `attest` | portable legacy compatibility |
| submit_verifier_response | pending | portable v2 verification capability |
| request_opstruth_verification | pending | portable after local published-subject sealing |

Hosted `create_objective` also includes publication policy. The CLI now exposes equivalent opt-in local publication through `go --publish branch|pull_request`. It uses existing local Git/GitHub authentication instead of recreating GitHub OAuth or the private hosted GitHub App.

## Human and agent contract

Every normal CLI operation must remain non-interactive after its arguments are supplied and return structured JSON for stateful results. Human-readable documentation may explain the workflow, but agents must not need to scrape prose to discover run IDs, states, effects, or capabilities.

`donestate capabilities` is the machine-readable discovery entry point.

## Safety differences that are intentional

Local publication starts only from a clean workspace, excludes `.donestate` runtime state from staging, checks the changed-file budget before the first publication effect, and records intent before each publication command. A crash during an unsettled external effect remains `AMBIGUOUS_EFFECT`; the CLI must not turn that into an automatic retry.

The hosted service may use OAuth, a selected GitHub App installation, encrypted per-user execution credentials, Cloudflare Durable Objects, Cloudflare Sandbox, provider-review identities, and Marketplace/account lifecycle state. Those are deployment mechanisms, not missing local CLI features.

## Remaining work

1. Design manual local maintenance discovery/findings/repair so it uses local GitHub authentication and does not import the hosted scheduler/registry.
2. Add a local published-subject record sufficient to seal the versioned v2 verification handoff.
3. Port strict v2 verification-response validation to the shared local package surface.
4. Add direct OpsTruth request/submit commands after the v2 subject is exact and replay-safe.
5. Keep process-level CLI acceptance tests for agent consumption and document every resulting command/argument before release.

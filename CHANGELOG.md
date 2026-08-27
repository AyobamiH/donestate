# Changelog

All notable changes follow Keep a Changelog. This project uses Semantic Versioning.

## [Unreleased]

### Added

- ChatGPT and Codex plugin package with objective, monitoring and independent-verification skills.
- OAuth-protected MCP Worker for public GitHub repositories.
- One durable coordinator and isolated Cloudflare Sandbox per hosted run.
- Exact-head branch and pull-request publication with durable intent and provider effect probes.
- Encrypted run credentials, bounded redacted action records and deletable terminal run data.
- Signed independent-verifier handoff for the hosted execution snapshot.

### Security

- Reject private repositories until short-lived GitHub App installation tokens are available.
- Require an externally visible branch or pull request before independent verification handoff.
- Stop uncertain remote effects at `AMBIGUOUS_EFFECT` instead of retrying them.

## [0.1.2] - 2026-08-27

### Fixed

- Derive the CLI help version from package metadata so installed releases cannot report a stale version.

## [0.1.1] - 2026-08-27

### Fixed

- Publish the `donestate` executable with npm 11-compatible CLI metadata.

## [0.1.0] - 2026-08-27

### Added

- Desired-outcome and standing-authority contracts.
- Durable SQLite run, action, event and lease stores.
- Effect intent and settlement records with idempotency keys.
- Worker leases with fencing tokens.
- Bounded no-shell process execution and output redaction.
- Safe recovery to `AMBIGUOUS_EFFECT` for unsettled actions.
- Git changed-file budget enforcement.
- Tamper-evident event chains and sealed verification handoffs.
- Pinned Ed25519 independent-verifier attestations.
- `go`, `init`, `run`, `resume`, `status`, `handoff`, `attest`, `verify-log` and `demo` CLI commands.

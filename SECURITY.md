# Security policy

## Supported versions

Security fixes are applied to the latest published minor release.

## Reporting

Report vulnerabilities privately through the repository's GitHub security advisory form. Do not open a public issue for an unpatched vulnerability.

Include the affected version, threat scenario, minimal reproduction and whether credentials or remote side effects are involved. Never include live secrets.

Hosted-service incidents follow the [incident-response runbook](docs/INCIDENT-RESPONSE.md), including the Marketplace provider-notification and evidence-closure requirements.

## Security boundary

DoneState is a deterministic orchestration control plane, not an operating-system sandbox. Child processes execute with the operating-system identity of the DoneState process and a deliberately reduced environment. Use an isolated runner or container for untrusted repositories or broad harness permissions.

`VERIFIED` means a pinned independent verifier signed the exact sealed snapshot. It does not imply that the verifier itself was correct, that every dependency is trustworthy, or that a deployment is reachable unless the cited evidence establishes those facts.

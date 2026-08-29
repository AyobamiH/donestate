# Maintenance canary

This document records the GitHub App scope selected for the DoneState owner-side maintenance canary. It is a configuration and provenance record, not proof that the canary or its pull request passed independent verification.

## Observation

- Observation date: `2026-08-29`
- Repository: `AyobamiH/donestate`
- GitHub App ID: `4761698`
- GitHub App slug: `donestate-maintenance-ayobamih`
- Installation ID: `157513439`

## Selected-repository policy

- Publication policy: `pr_only`
- Automatic repair: enabled
- Scheduling: enabled
- Required checks: `core (22)`, `core (24)`, and `hosted-plugin`

## Authority boundary

The installation can read Actions, issues, and repository metadata. It can read and write code and pull requests.

It has no administration, merge, deployment, release, workflow-write, environment, or secret authority.

## Supporting repair pull requests

The supporting GitHub App repair pull requests are `#12`, `#13`, `#14`, and `#16`.

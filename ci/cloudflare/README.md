# Native Cloudflare CI

The owner authorised use of the existing Cloudflare estate on 20 October 2026 and continuation on 21 October. These isolated Pages projects execute source validation and publish a **static engineering receipt**, not a production application. GitHub remains the source and review host. No GitHub runner starts, executes or cleans up the native build.

## Execution and trust

`node ci/cloudflare/run.mjs --provider cloudflare-pages` runs all manifest jobs sequentially in disposable worktrees, using pinned Node 22.23.3 / 24.22.0 binaries, fixed command argument arrays and an explicit child-environment allowlist. No shell interprets configured commands. Each job retains command exit codes, timing and output hashes. The wrapper has an 18-minute deadline and six-minute per-command limits; Pages imposes its own 20-minute build limit. There are no automatic retries. Provider cancellation and cleanup guarantees require separate provider evidence; the local command-group test is not a hosted cancellation acceptance.

The source commit must match the Pages environment and an open same-repository pull request against current main. The main branch uses its independently corroborated first parent. Tracked file hashes and Git index flags are checked before and after execution. The native provider API and GitHub App check must independently corroborate the deployment, source SHA, receipt and manifest before branch-policy migration. Environment variables alone are not hosted proof.

The public receipt excludes raw logs, credentials, local private paths and provider signing material. It has zero independent-adoption credit and does not establish release approval, publication, runtime deployment or an OpsTruth terminal verdict. The original disposable release must never be republished by CI.

This is an isolated trusted-maintainer-code executor, not a hostile-source sandbox. Do not enable builds for arbitrary forked/unreviewed code. Tests receive no production, Cloudflare, GitHub App, Google or signing credentials. Pages build environments contain only NODE_VERSION and SKIP_DEPENDENCY_INSTALL. No Pages Functions, custom domains or production resource bindings are configured.

## Spending and operation

Reuse the provisioned `proof-state-ci-*` Pages projects. Preserve the Free plan, no upgrades, no Functions and no Container execution. The published Free plan has a fixed 500-build monthly limit and one concurrent build; current remaining account headroom is not inferred from a concurrency slot. A provider quota refusal remains a held job, not permission to buy overage. Each acceptance attempt requires fresh plan/entitlement readback, an exact commit and one explicit trigger. Reconcile an uncertain trigger from deployment history; never blindly duplicate it.

Automatic builds remain disabled until a real native run and exact check-provider identity have been accepted. Do not remove existing required checks before an equivalent trusted check is demonstrated and the source guard and provider ruleset are changed together. AgentProof macOS coverage remains required separately and cannot be claimed from Linux. Production release recovery remains a different acceptance gate.

## Verification

`node --test ci/cloudflare/run.test.mjs` tests identity checks, environment filtering, manifest validation, command failure and real process-group timeout. Native acceptance additionally requires the provider deployment ID, exact-source static receipt, completed build/deploy stages, Functions=false, GitHub check identity and source SHA. Dated project records distinguish local fixtures, native execution, check reporting, branch-policy activation and release acceptance.

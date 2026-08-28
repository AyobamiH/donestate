---
name: maintain-repository
description: Use when a user wants DoneState to select one GitHub repository for recurring read-only maintenance discovery or opt-in PR-only repairs.
---

# Maintain a selected repository

Start with `get_github_app_status`. If the private DoneState GitHub App is not configured, call `create_github_app_setup` only for the Proof & State platform owner, provide its single-use link, and wait. After creation, the owner installs the App on selected repositories only.

Use `select_maintenance_repository` for one exact `owner/name`. Explain the policy as one boundary:

- `observe` records bounded findings and never repairs;
- `pr_only` permits a repair branch and pull request but never approval or merge;
- scheduling requires an installed GitHub App;
- automatic repair also requires scheduling, `pr_only`, and at least one exact required CI check name;
- only open issues explicitly labeled `donestate:repair` are repair-eligible;
- failing workflow runs are evidence only.

Do not infer selection from repository visibility, OAuth access, organization membership, or a request to inspect. Never select every repository or an organization wildcard.

Use `discover_maintenance_work` for an immediate read-only scan and `list_maintenance_findings` to inspect the durable results. Call `start_maintenance_repair` only for a repair-eligible finding. The Worker blocks changes to authority, security, workflow, contract, plugin, and deployment configuration paths.

Every repair publishes a pull request and stops for OpsTruth. If automatic verification cannot complete, call `request_opstruth_verification` once for the existing run; do not create a replacement objective. `AWAITING_VERIFICATION` remains unfinished and a receipt or passing command alone is not `VERIFIED`.

Use `remove_maintenance_repository` only when the user explicitly asks to remove that exact selection and confirms deletion of its finding history. Removing a selection does not uninstall the GitHub App.

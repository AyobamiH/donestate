# CLI release procedure

DoneState's local npm CLI and Hosted MCP are separate release trains. The hosted service may be at 0.3.0 while the public npm CLI uses its own SemVer sequence.

## Security boundary

CLI releases use npm trusted publishing from GitHub Actions and stage the package before it becomes public. The workflow has no long-lived npm write token. It receives a short-lived OIDC identity only for the configured workflow, and the final staged package still requires an npm maintainer to review and approve it with 2FA.

The release workflow is `.github/workflows/release-cli.yml`. It is manual-dispatch only, runs only from `main`, requires the requested version to exactly match `package.json`, refuses a version already present in the registry, runs `npm ci` and `npm run check`, then executes `npm stage publish`. It never runs `npm publish`.

## One-time trusted publisher setup

The npm package must trust this exact GitHub workflow before staging can succeed.

Using npm 11.15.0 or newer while authenticated as a maintainer with account 2FA enabled:

```bash
npm trust github donestate \
  --file release-cli.yml \
  --repository AyobamiH/donestate \
  --allow-stage-publish
```

Equivalent npmjs.com settings:

- publisher: GitHub Actions
- organization/user: `AyobamiH`
- repository: `donestate`
- workflow filename: `release-cli.yml`
- allowed action: `npm stage publish` only

The workflow filename is intentionally just the filename, not `.github/workflows/release-cli.yml`, because npm's trusted-publisher contract matches the workflow filename.

## Stage a release

1. Merge the release version, lockfile, changelog and governance evidence through protected `main`.
2. Require normal post-merge CI to pass.
3. Manually dispatch **Stage CLI release to npm** from `main` with the exact package version.
4. Require the staging workflow to pass and retain its run URL as release evidence.
5. On npmjs.com, open **Staged Packages**, inspect the staged artifact, and approve it with 2FA.
6. Verify registry metadata, a fresh install, the CLI-reported version and package provenance/signatures.
7. Only after those checks update Proof & State to call that version the latest **published** CLI.

## Fail-closed rules

- A Git merge is not npm publication.
- A successful staging workflow is not npm publication.
- Never store a long-lived npm write token in this repository for the normal release path.
- Do not direct-publish from this workflow.
- Do not reuse the Hosted MCP version number merely to make the release trains look aligned.
- If the trusted-publisher identity, workflow filename or package repository metadata drifts, stop and repair the trust relationship before staging again.

Official npm references:

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/staged-publishing/
- https://docs.npmjs.com/cli/v11/commands/npm-trust/

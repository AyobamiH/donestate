# Contributing

## Set up

```bash
npm install
npm run check
```

## Pull requests

Keep changes small enough to audit. Explain the trust boundary affected, add tests for failure and recovery paths, and update the threat model when a change creates a new authority or external effect.

Do not weaken independent verification, lease fencing, intent-before-effect ordering, environment isolation, redaction or default-deny remote authority to improve convenience.

## Commit style

Use focused commits with an imperative subject. Never include credentials, local state databases, generated package archives or harness transcripts containing private data.

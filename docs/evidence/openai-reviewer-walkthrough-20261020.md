# Recorded DoneState acceptance walkthrough

This 90-second silent walkthrough explains actual recorded live acceptance. It is not a recording of a new UI session or new execution. Passwords, API keys, OAuth codes, session cookies and one-time links are excluded.

Source: [acceptance record](openai-reviewer-acceptance-20261020.json).

## Recorded acceptance walkthrough

DoneState 0.3.3 | 20 October 2026

Source: real OAuth/MCP acceptance and exact PR evidence.

This recording explains recorded results; it is not a new execution.



Reviewer path: connect > settings > fixture > repair > verify.

Use the private username/password supplied in Review information.

No reviewer API key, GitHub account, Gmail or MFA is required.

## 1 / Connect and inspect

Connect: https://donestate.proofandstate.com/mcp

Choose: OpenAI reviewer test account

Username: openai-reviewer | Password: supplied privately



get_openai_credential_status: connected, publisher_review_demo

Isolated account: review:openai:v1

Selected repository: AyobamiH/donestate-review-fixture

Browser publisher connection was also confirmed.

## 2 / Open account settings

Prompt: Open my DoneState account settings.

Tool: create_openai_credential_setup({})

Returns only setupUrl and expiresAt.



Recorded live result: HTTPS account console 200; replay 400.

The link expires after 10 minutes and invalidates the old link.

Regression: old link 400 > new link 200 > replay 400.

The stored account credential remains unchanged.

## 3 / Inspect maintenance work

Prompt: Find repair work in the prepared review fixture.

Use discover_maintenance_work and list_maintenance_findings.



Sample issue: fixtures/invoice.json

Line items total 55; the stored total is 50.

Discovery records findings without starting a repair.

Only the prepared fixture is available to the review account.

Scheduling and automatic repair remain disabled.

## 4 / Execute and publish

Goal: change only the fixture total to 55; run npm test.

Authorise local_read, local_write, test, commit, push,

open_pr and secret_access. Max 1 file; max 300000 ms.



Run: 2e0184b7-0771-4651-b6c1-88aa41e2a4f0

Actual PR: AyobamiH/donestate-review-fixture #2

Head: 306facf9002075ee16deb07e4fcafc94291f9021

Local fixture tests: 9 passed. No hosted CI pass is claimed.

## 5 / Independently verify

Use create_verification_handoff and request_opstruth_verification.

DoneState must not approve its own completion.



The existing pinned OpsTruth signer verified the exact snapshot.

Criterion 1: JSON pointer /total equals 55.

Criterion 2: only fixtures/invoice.json changed.

Result: VERIFIED at 2026-10-20T20:40:45.972Z

Report: bd2d268d4c2c632714d8bf21a49b853657d680af4...

## Negative tests and recovery

Passed live: incorrect login, bad CSRF, secret tool input,

foreign repository, excess files/duration, untrusted verifier,

branch-only publication, deployment authority and ticket replay.



Credential/selection deletion + reconnect restored only the demo.

Daily usage stayed 1 of 3; the VERIFIED run was preserved.

Revoked access tokens returned HTTP 401.

Whole-account deletion has code-test coverage only.

## Reviewer non-trigger cases

Saved three prompts where DoneState must not be invoked:

1. Merge, deploy and release software.

2. Book travel and a hotel.

3. Send an email to a client.



These are reviewer evaluation cases, not measured routing passes.

Five positive cases include full inputs and expected outcomes.

The private reviewer password is never shown in this recording.

## Fresh scan and review boundary

The settings-link destructive annotation defect was fixed.

Build + 17 focused tests passed; the fix is live.

A production scan reduced findings from 2 to 1.



Remaining: new tool definition requires provider review.

The red review hold is not claimed cleared.

Submission preparation is not approval or publication.

Full evidence: docs/evidence/openai-reviewer-acceptance-20261020.json


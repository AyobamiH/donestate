# Customer learning loop

Owned-domain GA is complete under E-118. Market fit is not established. Publisher acceptance, an independently verified canary and successful OAuth are product-readiness evidence; customer demand, repeated useful outcomes and payment require external observations.

## First customer hypothesis

Start with maintainers of public repositories who have a small, recurring regression or maintenance fix and want a reviewable PR with independent evidence. This is a hypothesis, not a demonstrated customer segment. Use one repository, one concrete issue, a bounded diff and explicit acceptance tests. Avoid broad rewrites as the first job.

Observe incoming customers using this job as distribution and product development continue. The publisher intends Post-Once to surface the product and warm conversations; this slice does not inspect or certify that publishing integration. Review evidence as it arrives. Five customers may be a convenient first review batch, but recruitment and reaching that number are not development gates or statistical market-fit thresholds. Record a customer's existing alternative and reason for trying DoneState only when naturally available through consented conversation or feedback. Do not count the publisher, internal maintenance, reviewer fixtures or acceptance tests as external demand.

Start with this customer brief, replacing the bracketed details before creating an objective:

> Fix [one reproducible regression] in [my public repository]. Reproduction: [steps or failing test]. Success: [observable expected behaviour] and the relevant existing tests pass. Keep the public API stable and the diff within [agreed files/budget]. Open a reviewable PR; obtain independent verification for its exact head. I will judge usefulness against [the original job].

If the customer cannot describe a concrete job or fund the execution credential, record that friction before execution. After the result, ask what it replaced, whether it was useful, what they would use it for next and whether they would accept a specific priced offer. Keep the questions neutral; positive feedback without use or commitment remains feedback.

Use the public [first-job guide](https://proofandstate.com/docs/donestate/get-started) and [first-attempt recovery](https://proofandstate.com/docs/donestate/troubleshooting#first-attempt), with the supported [hosted setup](STANDALONE-MCP.md): connect MCP, GitHub sign-in, customer credential setup, bounded objective, PR and pinned independent verification. Before a run, explain that model usage is charged to the customer's own funded OpenAI API account. Account connection and a PR alone are not activation. Activation requires an independently verified result the customer accepts as useful for the stated job.

After a useful result, observe whether the customer returns with a second comparable job. Count seven-day repeat eligibility only for a customer whose first useful result is at least seven days old at the observation cutoff. Customers without that follow-up window have unknown retention; do not count them as churned.

Test a clearly scoped priced offer with customers who got value. Record the exact offer and written acceptance separately; an expression of interest is not a price commitment. Count payment only against a settled payment receipt. This slice creates no checkout, subscription, billing entitlement or charge, and it makes no new Marketplace pricing claim. The publisher chooses a real offer and delivers it through an authorised commercial lane.

## Operator review

The existing production counters still show stage activity. They cannot identify unique customers or repeat use. The local review below accepts anonymous, manually reconciled cohort aggregates without adding customer tracking to production:

```sh
node scripts/review-market-fit.mjs examples/market-fit-cohorts.json
```

This is repository operator tooling, not a new installed CLI command or MCP tool. Planned cohorts belong in research planning; a cohort with zero participants is rejected as an observation. The checked-in input is empty deliberately: no external cohort observation has been supplied. Its report returns `not_observed` and `marketFit: not_established`. Keep real research notes and customer evidence out of the public repository. Supply an operator-controlled local JSON file once observations exist. Never place emails, GitHub logins, repositories, prompts, tokens or payment details in it or its output.

The input has exactly `schema: donestate.market-fit-cohorts.v1` and `cohorts`, with at most 100 cohort records. Every record has exactly these fields:

| Field | Meaning |
| --- | --- |
| `id` | Anonymous `c-YYYYMMDD-NN`, unique within the file |
| `job` | `public_repository_bounded_fix` |
| `channel` | `owned_domain`, `openai_directory` or `github_marketplace`; use the actual acquired channel, never a listing preview |
| `population` | `external_customers`; excludes publisher and test activity |
| `startedOn`, `observedThrough` | Valid UTC dates, ordered and no later than the review date |
| `counts` | All ten non-negative integer fields below |
| `blockers` | All nine fixed non-negative participant counts below |
| `evidence` | Between 1 and 100 objects containing exactly `kind` and a unique lowercase SHA256 of separately held evidence |

`counts` contains `participants`, `connected`, `attempted`, `usefulVerified`, `repeatEligible`, `usefulRepeat`, `offerShown`, `paymentCommitted`, `paid` and `supportMinutes`. A participant is one consenting external customer, reconciled by the operator within that cohort. Connection requires successful customer OAuth; attempted means an objective actually started. A useful result requires both pinned independent verification and customer acceptance. Repeat means a second useful result, not another login. Support minutes include onboarding, incident and operator intervention time during the window.

The script rejects counts above their denominators. It requires evidence kinds `intake` for participants, `customer_accepted_verified_result` for useful results, `repeat_result` for repeat use, `written_price_acceptance` for commitments, `payment_receipt` for payment and `support_record` for support time when their corresponding count is nonzero. Hash references do not prove those documents' truth; operators must inspect and reconcile the separately held records. The script does not fetch, independently verify or certify them.

`blockers` contains `oauth`, `credential_funding`, `repository_permission`, `objective_clarity`, `execution`, `verification`, `cost`, `value` and `private_repository`. Count distinct affected participants for each category, at most once per participant per category. A customer may have multiple blockers. These are friction counts, not failed-customer totals. Record observed reasons; do not infer `cost` or `value` from silence.

Output reports activation per participant, useful-result success per attempted customer, repeat per eligible customer, written commitment and payment per shown offer, and support minutes per useful result. Zero denominators return `null`. Cohorts and channels stay separate: anonymous aggregates cannot detect customers duplicated across cohorts, so there is no pooled unique-user total. Bad schema, private-data fields, invalid dates, impossible counts and missing evidence kinds are rejected with exit code 1 and a redacted error. A valid but empty report exits 0; it is not positive demand evidence.

## Weekly decision

Review within seven days of first cohort entry. Fix the largest evidenced blocker, change one variable and observe the next comparable cohort. High connection but no useful result points to job clarity or execution; useful results without repeat use require understanding the next job and alternatives; repeat use without payment requires an actual offer test. Measure support burden alongside value before expanding volume.

Private-repository demand, broad OAuth objections, verification coverage and funded-key friction are explicit questions. Promote the relevant deferred work only when those constraints are observed, while preserving its permission, confidentiality and independent-verifier requirements. New adapters, merge queues and fleet features remain tied to a customer problem.

There is no automatic market-fit declaration. Even a cohort with paid repeat use is an early signal requiring comparable subsequent cohorts, support/cost evidence and retention beyond the first observation window. GTM-001 stays active as development improves first use and evidence accumulates naturally. Do not pause building to fill a cohort or require the publisher to run a separate recruitment programme. The publisher records the next evidence-based product decision; external messages and invitations remain in their authorised distribution lanes.

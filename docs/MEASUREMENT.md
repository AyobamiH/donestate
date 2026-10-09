# Owned-service measurement boundary

DoneState measures the owned-domain funnel with privacy-minimal aggregate counters. This instrumentation exists to show whether the service path is being used and where workflows stop; it is not a user-tracking system.

## Daily counters

The production MaintenanceRegistry stores one UTC-day counter per fixed event name:

- `oauth_connection_completed`
- `credential_setup_issued`
- `account_console_opened`
- `credential_connected`
- `repository_selected`
- `objective_created`
- `objective_started`
- `pull_request_opened`
- `verification_verified`
- `verification_failed`
- `verification_uncertain`
- `account_deletion_completed`

The stored row is only `day_utc`, `event_name`, `event_count`, and an update timestamp. Counters are retained for at most 90 days.

## Deliberately excluded data

The funnel table does not contain GitHub login, account ID, repository, run ID, pull-request number, email, IP address, objective or prompt text, credential material, Marketplace plan identity, or another customer identifier.

Internal `maintenance_pr` execution does not contribute to customer objective-start, pull-request, or verification counters.

## Reporting

The existing hourly maintenance sweep emits the current UTC day's aggregate funnel snapshot alongside operational health. No public analytics endpoint or new MCP tool is added.

These aggregate counts can show stage volume and rough stage ratios, but they cannot prove unique users, repeat users, per-user conversion, retention cohorts, or attribution. Those measurements require bounded manual cohort evidence or a separately reviewed privacy-preserving design. OpenAI and GitHub Marketplace channel attribution must remain separate from owned-domain counts when those channels publish.

The [customer learning loop](MARKET-FIT.md) supplies a strict anonymous operator-review input and `scripts/review-market-fit.mjs`. It measures manually evidenced customer-accepted useful results, eligible repeat use, actual paid conversion and support burden per cohort. It does not pool cohorts into unique-user totals, treat unknown denominators as zero, or certify market fit. The checked-in empty input records that external cohort outcomes have not yet been observed.

# DoneState OpenAI reviewer access and resubmission gate

Updated: 20 October 2026.

## Current provider decision

OpenAI rejected DoneState v1.0.0 on 19 October 2026, submission
asdk_app_6abf3b8d3cb08191b1b4e670a707e652, because the reviewer could
not complete sign-in or OAuth. The email did not identify the failed step.

This is a new publisher entry; do not mistake historical 0.2.x / 0.3.x
review records or the legacy local .app.json mapping for the submitted
v1.0.0 review credentials.

## Reviewer sign-in instructions for the private OpenAI Review details form

1. Start Connect on the DoneState MCP app using the submitted canonical
   HTTPS endpoint, https://donestate.proofandstate.com/mcp.
2. On the DoneState Authorise screen, use the visible OpenAI reviewer test
   account section, not the Continue with GitHub button.
3. The test username is openai-reviewer. Use the current high-entropy
   password entered separately in the private OpenAI Review details form.
   The password must match the SHA-256 digest configured on the production
   Worker at the time of submission.
4. Select Sign in to review. The OAuth client should receive the same
   callback state and issuer and finish its token exchange.
5. This account needs no GitHub sign-in, SMS/email confirmation, MFA,
   passkey, account creation, GitHub App installation, or OpenAI API key.
6. Its access is intentionally read-only. It can inspect sample repository
   and execution evidence; it cannot execute jobs, write credentials,
   select repositories, make pull requests, merge, deploy, or submit
   verification. Choose review-positive cases accordingly. A positive
   case requiring execution cannot pass with this restricted account.
7. The dedicated reviewer form appears for the execution OAuth scope.
   The separate identity-only account-controls flow correctly requires
   GitHub ownership and does not expose reviewer impersonation.

## Independent evidence and strict go/no-go

On 20 October, public metadata discovery passed, dynamic registration
returned HTTP 201, the execution consent page returned HTTP 200, and
an intentionally invalid reviewer password returned HTTP 401. The main
button redirected to GitHub. Those checks establish reachability and a
fail-closed negative response, NOT a valid reviewer sign-in.

Before resubmission, prove a real fresh-client positive reviewer login
using the exact private password from Review details. Verify callback,
OAuth code exchange, read-only MCP tool invocation, token revocation
and denial after revocation; record only redacted statuses and hashes.
Never paste the password, code, token, or browser callback into an
issue, public repository, test log, email, or chat.

If the password in Review details is missing or differs from the deployed
hash, update the private review credentials (or rotate the reviewer
password through an authorised secret workflow) and reprove the login.
Do not reuse historical draft credentials without checking the current
submission. The public source contains only the hash.

If the provider still cannot authenticate after fresh acceptance,
reply directly to the 19 October rejection email, cite the current
publisher submission ID, and request the exact failed redirect,
authorization, callback or token-exchange stage. No approval or
publication can be claimed on the basis of local tests.

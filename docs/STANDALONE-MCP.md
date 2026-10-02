# Standalone hosted MCP setup

DoneState can be used through its owned Proof & State MCP service without waiting for an OpenAI directory listing or GitHub Marketplace publication.

## Endpoint

Use the canonical remote MCP endpoint:

`https://donestate.proofandstate.com/mcp`

The client must support remote HTTP MCP plus the OAuth flow exposed by the service. The protocol surface is client-neutral; a client that has not been accepted end to end should still be treated as a new integration until its authentication, tool calls and browser handoffs have been proven.

## Current customer path

1. Add the endpoint to a compatible MCP client.
2. Complete DoneState OAuth and sign in with GitHub.
3. Run `get_openai_credential_status`.
4. If no execution credential is connected, run `create_openai_credential_setup`, open the single-use HTTPS setup URL and save your own OpenAI API key there. Do not paste the key into the MCP conversation.
5. Start with a public GitHub repository where the authenticated GitHub identity has push access.
6. Create one bounded objective with `create_objective`. Grant only the consequence classes that objective needs.
7. Inspect progress with `get_objective`.
8. For an independently verified result, use `create_verification_handoff` or `request_opstruth_verification` as appropriate for the configured verifier contract.
9. Review the resulting branch and pull request in GitHub. DoneState does not merge its own pull requests.

## Authority classes

Hosted objectives accept these explicit authority classes:

- `local_read`
- `local_write`
- `test`
- `commit`
- `push`
- `open_pr`
- `secret_access`

Do not grant a class merely because it is available. A normal PR-producing objective commonly needs local read/write, tests, commit, push and open-PR authority. Whether `secret_access` is appropriate depends on the objective and execution path.

## Repository scope

The currently proven customer path is public-repository execution through the authenticated GitHub identity.

Private repositories require a selected DoneState GitHub App installation in `pr_only` mode. The existing production maintenance App is deliberately restricted; do not describe arbitrary private-repository self-service as generally available until a fresh external-account acceptance proves that path.

## Distribution channels

The owned-domain service, OpenAI/ChatGPT distribution and GitHub Marketplace are separate channels:

- The owned-domain service may operate while external listings are still under review.
- OpenAI review and publication continue independently.
- GitHub Marketplace review and lifecycle testing continue independently.
- Approval or failure in one channel does not prove the state of another channel.

No channel changes DoneState's core authority boundary: remote work is bounded, PR-oriented and independently verifiable, and final merge authority remains with the repository owner.

## Deletion and current launch boundary

The service already exposes `delete_objective` for eligible terminal/cancelled objectives and `delete_openai_credential` for the stored user-funded execution credential.

Whole-account deletion and a consolidated account/status surface remain tracked customer-readiness work. Until those are complete and a fresh clean-account customer journey is proven, treat the owned-domain launch as controlled technical access rather than unrestricted self-serve GA.

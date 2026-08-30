# DoneState privacy notice

**Effective date:** 30 August 2026  
**Last updated:** 30 August 2026

This notice applies to the hosted DoneState service at `donestate.proofandstate.com` and its GitHub Marketplace listing. It does not apply to a copy of the open-source command-line package that you run entirely under your own control.

## Who is responsible for your data

The hosted service is operated by **AYOBAMI JOHN HAASTRUP, a United Kingdom sole trader trading as Proof & State** ("Proof & State", "we", "us"). Proof & State is the controller for account, Marketplace and service-operation data described in this notice.

For a non-confidential privacy request, open an issue at <https://github.com/AyobamiH/donestate/issues>. Do not place credentials or other sensitive personal data in a public issue. For a confidential security or privacy report, use GitHub's private reporting channel at <https://github.com/AyobamiH/donestate/security/advisories/new>.

## Data we process and where it comes from

We process only data needed to provide, secure and evidence the service:

- **GitHub and Marketplace identity:** GitHub account ID, login, account type, authorising login, public profile fields, selected Marketplace plan and entitlement lifecycle. This comes from GitHub OAuth and the GitHub Marketplace API.
- **Repository objective and authority:** the public repository, base reference, objective, acceptance criteria, authority envelope, execution budget and repository selection that you submit.
- **Credentials:** an encrypted GitHub credential needed for an authorised repository objective and an OpenAI API key that you provide through the dedicated encrypted settings flow. Marketplace onboarding access tokens are not retained.
- **Work and evidence:** relevant public source code, diffs, validation output, branch and pull-request references, action results, verifier attestations and evidence references.
- **Operational and security metadata:** timestamps, delivery identifiers, state transitions, failures and bounded diagnostic records needed to operate, secure, deduplicate and audit the service.

Data comes from you, GitHub, the selected public repository, OpenAI execution results and the independent verifier, such as OpsTruth. DoneState is not intended for special-category data, regulated workloads or secrets placed in objectives, source code or issue reports. Credentials must be supplied only through the designated secret-entry flow.

## Why we process data

| Purpose | UK GDPR lawful basis |
| --- | --- |
| Create and maintain the Marketplace entitlement, authenticate you and provide the requested service | Necessary to perform our contract with you |
| Execute the explicit repository objective and produce the authorised branch, pull request and evidence | Necessary to perform our contract with you |
| Secure the service, prevent abuse, deduplicate external effects, investigate failures and maintain an evidence trail | Our legitimate interests in operating a safe, reliable and accountable service |
| Respond to support, privacy and security requests | Contract performance and our legitimate interests in supporting the service |
| Meet legal, regulatory or court requirements | Compliance with a legal obligation |

We do not sell personal data, use GitHub personal data for third-party advertising, or use it for unrelated marketing.

## Providers and disclosures

We disclose the minimum necessary data to:

- **Cloudflare**, for hosting, storage, networking and isolated sandbox execution;
- **GitHub**, for identity, Marketplace entitlement, public-repository access, branches, checks and pull requests;
- **OpenAI**, using the API credential you provide, for the bounded coding execution you request;
- **OpsTruth or another pinned independent verifier**, for the bounded execution snapshot and evidence needed to assess the result; and
- professional advisers, regulators, courts or public authorities where disclosure is reasonably necessary and legally permitted or required.

Each provider also processes data under its own terms and privacy documentation. Marketplace entitlement does not itself select a repository, grant execution authority, start work, push code or open a pull request.

## International processing

The service does not promise UK-only storage or processing. Cloudflare, GitHub, OpenAI and their subprocessors may process data in the United Kingdom, European Economic Area, United States and other countries in which they operate. Where UK data-protection law requires a transfer safeguard, we rely on the applicable provider agreement, adequacy regulation, the UK Extension to the EU-US Data Privacy Framework, or approved contractual safeguards such as the UK Addendum to the EU Standard Contractual Clauses. Copies of provider safeguards are available through the providers' published privacy and data-processing terms.

## Retention and deletion

| Record | Retention rule |
| --- | --- |
| Marketplace OAuth state | Ten minutes; it is one-time and consumed or expires |
| Marketplace onboarding access token | Used to verify identity and the selected plan, then discarded |
| Marketplace entitlement record | Kept while needed to administer the entitlement, handle cancellation and prevent duplicate events; deleted when no longer required for those purposes |
| Encrypted GitHub objective credential | Kept for the active objective and deleted when the terminal or cancelled objective is deleted |
| Encrypted user-funded OpenAI credential | Kept until you replace or delete it, close the service relationship, or the hosted service is withdrawn |
| Objective, action and evidence record | Kept to provide durable recovery and accountability until you delete the terminal or cancelled objective or the service is withdrawn |
| Provider security and operational logs | Kept under the relevant provider's published retention schedule and our configured service settings |

The current service exposes `delete_objective` for terminal or cancelled objectives and `delete_openai_credential` for the account-level OpenAI credential. Revoking a GitHub grant or cancelling a Marketplace plan at GitHub does not automatically delete every record already needed to evidence prior authorised work; submit a deletion request if you also want the remaining eligible service records removed. If the GitHub data-processing relationship terminates, GitHub-supplied personal data will be deleted within the period required by the GitHub Marketplace Developer Agreement unless law requires otherwise.

## Security

Credentials are encrypted at rest with separate operator-managed AES-GCM keys. Setup links are short-lived and single-use. Credentials are scoped into isolated execution, removed after use where documented, and redacted from bounded output. Consequential operations require explicit authority, and the service cannot merge, deploy, release, modify environments or secrets, or mark its own work verified. No online service can guarantee absolute security.

## Your choices and rights

You can decline to provide required identity, credential or objective data, but DoneState will then be unable to provide the corresponding service. You can cancel the Marketplace plan, revoke GitHub authorisation, delete eligible objectives and delete the stored OpenAI credential.

Depending on the circumstances, UK data-protection law gives you rights of access, correction, erasure, restriction, portability and objection.

**You have the right to object to processing based on our legitimate interests.** We will stop that processing unless we demonstrate compelling legitimate grounds or need it for legal claims.

Use the contact routes above to exercise a right. We may need to verify your identity. You may complain to the UK Information Commissioner's Office at <https://ico.org.uk/make-a-complaint/data-protection-complaints/>.

## Automated processing

DoneState and the connected model automate code generation, validation orchestration and service-state classification. They do not make solely automated decisions intended to produce legal or similarly significant effects about an individual. Users retain control over repository selection, authority, review and merge decisions. A `VERIFIED` state reflects bounded evidence and a pinned verifier; it is not a guarantee of correctness, security or fitness for purpose.

## Changes to this notice

We may update this notice when the service, providers or law changes. The current version and effective date will remain published in this repository. Material new uses of personal data will be brought to affected users' attention before they begin where required by law.

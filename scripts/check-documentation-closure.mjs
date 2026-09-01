import { access, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

for (const file of ["README.md", "CHANGELOG.md", "docs/CURRENT-STATUS.md", "docs/ROADMAP.md", "docs/HOSTED-PLUGIN.md", "docs/DIRECTORY-SUBMISSION.md", "docs/INCIDENT-RESPONSE.md", "docs/GITHUB-MARKETPLACE.md", "docs/GITHUB-MARKETPLACE-PREFLIGHT.md", "docs/GITHUB-MARKETPLACE-DEVELOPMENT.md", "governance/project-ledger.json", "AGENTS.md"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
const [readme, hosted, status, roadmap, directory, marketplace, marketplacePreflight, marketplaceDevelopment, ledgerSource] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/HOSTED-PLUGIN.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/CURRENT-STATUS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/ROADMAP.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/DIRECTORY-SUBMISSION.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/GITHUB-MARKETPLACE.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/GITHUB-MARKETPLACE-PREFLIGHT.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/GITHUB-MARKETPLACE-DEVELOPMENT.md", import.meta.url), "utf8"),
  readFile(new URL("../governance/project-ledger.json", import.meta.url), "utf8"),
]);
const ledger = JSON.parse(ledgerSource);
if (/full hosted canary remain|required canaries before directory submission/.test(`${readme}\n${hosted}`)) {
  throw new Error("documentation still claims the completed hosted canary is pending");
}
const staleClaims = [
  /technically prepared free GitHub Marketplace listing/,
  /DRAFT SAVED, NOT SUBMITTED/,
  /directory submission pending/,
  /owner setup, selected installation and production canary pending/,
  /activation and production canary pending/,
  /development preview does not claim/,
];
for (const claim of staleClaims) {
  if (claim.test(`${readme}\n${hosted}\n${status}\n${roadmap}\n${directory}`)) {
    throw new Error(`documentation contains a stale product-state claim: ${claim}`);
  }
}
for (const subject of ["179e02c1a99dab780cabe09c4f5882e7e492ad18", "33210941821", "631d8a08-d337-4bae-bd18-b55c31f48a8b", "AWAITING_VERIFICATION"]) {
  if (!`${status}\n${hosted}`.includes(subject)) throw new Error(`current status is missing required subject: ${subject}`);
}

const historicalMarketplaceEvidence = ledger.evidenceStories.find((story) => story.id === "E-001");
const expectedHistoricalMarketplaceEvidence = {
  id: "E-001",
  date: "2026-08-30",
  identity: "DoneState Marketplace listing attached to OAuth App 3822030",
  situation: "The free public-repository listing completed prerequisites and was submitted for GitHub review.",
  verification: "GitHub displayed Thank you for your submission, Pending for publish, and under review; PR 45 merged as 37e049b9d6b6749c2085562ac84f433e40e404e4 and exact post-merge CI passed all three required jobs.",
  accountability: {
    owner: "Publisher owner",
    status: "blocked",
    nextAction: "Respond to reviewer feedback and record every state transition.",
    waitCondition: "GitHub reviewer decision or request.",
    staleDate: "2026-09-15",
  },
  outcome: "The listing is under review, not approved or published.",
  content: "Listing copy, legal policies, media, demo, and signed lifecycle webhook.",
  measurement: "One signed GitHub ping returned HTTP 200; no live purchased or cancelled event has been observed.",
};
if (!isDeepStrictEqual(historicalMarketplaceEvidence, expectedHistoricalMarketplaceEvidence)) {
  throw new Error("E-001 must remain the exact historical Marketplace review receipt");
}

const marketplaceTruthItem = ledger.workItems.find((item) => item.id === "MKT-001");
const currentMarketplaceEvidenceId = marketplaceTruthItem?.evidenceIds?.at(-1);
const currentMarketplaceEvidence = ledger.evidenceStories.find((story) => story.id === currentMarketplaceEvidenceId);
if (!currentMarketplaceEvidence || currentMarketplaceEvidence.id === "E-001" || currentMarketplaceEvidence.date <= historicalMarketplaceEvidence.date) {
  throw new Error("MKT-001 must end with newer Marketplace evidence that refreshes E-001");
}

const currentEvidenceText = JSON.stringify(currentMarketplaceEvidence);
for (const fact of [
  "https://github.com/marketplace/donestate/edit",
  "Pending for publish",
  "Withdraw request",
  "This listing has not been published to Marketplace",
  "This listing is a draft and has not yet been published on GitHub Marketplace",
  "https://github.com/marketplace/donestate",
  "AyobamiH",
  "Add",
  "Install it for free",
  "$0",
  "Public repositories",
  "1 install",
  "unauthenticated exact Marketplace search returned no result",
  "https://github.com/marketplace/manage",
  "production and development",
  "owner inventory rather than public evidence",
  "SUBMITTED / IN_REVIEW",
  "https://platform.openai.com/plugins",
  "0.2.0",
  "Review",
]) {
  if (!currentEvidenceText.includes(fact)) throw new Error(`current Marketplace evidence is missing provider fact: ${fact}`);
}
for (const gap of ["public availability", "public discoverability", "webhook delivery", "entitlement state", "OAuth completion", "repository selection", "execution", "billing", "retention", "user outcome"]) {
  if (!currentEvidenceText.includes(gap)) throw new Error(`current Marketplace evidence is missing proof gap: ${gap}`);
}

const currentMarketplaceDocs = new Map([
  ["README.md", readme],
  ["docs/CURRENT-STATUS.md", status],
  ["docs/ROADMAP.md", roadmap],
  ["docs/GITHUB-MARKETPLACE.md", marketplace],
  ["docs/GITHUB-MARKETPLACE-PREFLIGHT.md", marketplacePreflight],
  ["docs/GITHUB-MARKETPLACE-DEVELOPMENT.md", marketplaceDevelopment],
]);
const evidenceMarker = `<!-- Current GitHub Marketplace evidence: ${currentMarketplaceEvidenceId} -->`;
for (const [file, contents] of currentMarketplaceDocs) {
  if (!contents.includes(evidenceMarker)) throw new Error(`${file} does not point to current Marketplace evidence ${currentMarketplaceEvidenceId}`);
  for (const fact of ["Pending for publish", "https://github.com/marketplace/donestate", "AyobamiH", "$0", "Public repositories", "1 install"]) {
    if (!contents.includes(fact)) throw new Error(`${file} is missing current Marketplace fact: ${fact}`);
  }
  if (!/not (?:been )?published/i.test(contents)) throw new Error(`${file} does not state that the Marketplace submission is unpublished`);
  if (!/owner(?:-authenticated)? \[?preview/i.test(contents)) throw new Error(`${file} does not identify the Marketplace page as an owner preview`);
  if (!/unauthenticated exact Marketplace search return(?:ed|s) no result/i.test(contents)) throw new Error(`${file} is missing the unauthenticated search result`);
  for (const gap of ["public availability", "webhook delivery", "entitlement", "OAuth completion", "repository selection", "execution", "billing", "retention", "user outcome"]) {
    if (!contents.toLowerCase().includes(gap.toLowerCase())) throw new Error(`${file} is missing Marketplace proof gap: ${gap}`);
  }
}

const currentMarketplaceText = [readme, status, roadmap, marketplace, marketplaceDevelopment].join("\n");
for (const claim of [
  /publicly discoverable/i,
  /source of truth for the public \[DoneState GitHub Marketplace listing\]/i,
  /found the public listing at/i,
  /the public page at `https:\/\/github\.com\/marketplace\/donestate`/i,
  /current public page also displays/i,
  /\| Listing \| Public `DoneState` listing/i,
  /production OAuth App, public listing configuration/i,
  /- \[x\] Public production listing/i,
]) {
  if (claim.test(currentMarketplaceText)) throw new Error(`current documentation treats an owner preview as published: ${claim}`);
}
for (const [file, contents] of [["README.md", readme], ["docs/CURRENT-STATUS.md", status], ["docs/ROADMAP.md", roadmap], ["docs/GITHUB-MARKETPLACE.md", marketplace], ["docs/GITHUB-MARKETPLACE-PREFLIGHT.md", marketplacePreflight]]) {
  for (const fact of ["OpenAI", "0.2.0", "Review"]) {
    if (!contents.includes(fact)) throw new Error(`${file} is missing the separate current OpenAI review state: ${fact}`);
  }
}
console.log("documentation closure: ok");

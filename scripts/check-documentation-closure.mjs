import { access, readFile } from "node:fs/promises";

for (const file of ["README.md", "CHANGELOG.md", "docs/CURRENT-STATUS.md", "docs/ROADMAP.md", "docs/HOSTED-PLUGIN.md", "docs/DIRECTORY-SUBMISSION.md", "docs/INCIDENT-RESPONSE.md", "AGENTS.md"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
const [readme, hosted, status, roadmap, directory] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/HOSTED-PLUGIN.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/CURRENT-STATUS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/ROADMAP.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/DIRECTORY-SUBMISSION.md", import.meta.url), "utf8"),
]);
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
console.log("documentation closure: ok");

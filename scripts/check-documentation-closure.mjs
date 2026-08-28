import { access, readFile } from "node:fs/promises";

for (const file of ["README.md", "CHANGELOG.md", "docs/CURRENT-STATUS.md", "docs/ROADMAP.md", "docs/HOSTED-PLUGIN.md", "docs/DIRECTORY-SUBMISSION.md", "AGENTS.md"]) {
  await access(new URL(`../${file}`, import.meta.url));
}
const [readme, hosted, status] = await Promise.all([
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/HOSTED-PLUGIN.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/CURRENT-STATUS.md", import.meta.url), "utf8"),
]);
if (/full hosted canary remain|required canaries before directory submission/.test(`${readme}\n${hosted}`)) {
  throw new Error("documentation still claims the completed hosted canary is pending");
}
for (const subject of ["be68e820149f94f8489ab6a04e6e49d00abd90cd", "631d8a08-d337-4bae-bd18-b55c31f48a8b", "AWAITING_VERIFICATION"]) {
  if (!`${status}\n${hosted}`.includes(subject)) throw new Error(`current status is missing required subject: ${subject}`);
}
console.log("documentation closure: ok");

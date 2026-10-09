import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const counts = ["participants", "connected", "attempted", "usefulVerified", "repeatEligible", "usefulRepeat", "offerShown", "paymentCommitted", "paid", "supportMinutes"];
const blockers = ["oauth", "credential_funding", "repository_permission", "objective_clarity", "execution", "verification", "cost", "value", "private_repository"];
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const exact = (value, keys, label) => {
  fail(value && typeof value === "object" && !Array.isArray(value), `${label}: object required`);
  fail(Object.keys(value).sort().join(",") === [...keys].sort().join(","), `${label}: unexpected or missing fields`);
};
const day = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const rate = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;

// Operator-entered anonymous aggregates are observations, not independently
// verified customer telemetry. Hash references locate separately held evidence;
// this script neither fetches it nor upgrades it to an audited conclusion.
export function reviewMarketFit(input, asOf = new Date().toISOString().slice(0, 10)) {
  fail(day(asOf), "asOf: valid UTC date required");
  exact(input, ["schema", "cohorts"], "input");
  fail(input.schema === "donestate.market-fit-cohorts.v1", "unsupported schema");
  fail(Array.isArray(input.cohorts) && input.cohorts.length <= 100, "cohorts: bounded array required");
  const ids = new Set();
  const groups = new Map();
  for (const cohort of input.cohorts) {
    exact(cohort, ["id", "job", "channel", "population", "startedOn", "observedThrough", "counts", "blockers", "evidence"], "cohort");
    fail(/^c-\d{8}-\d{2}$/.test(cohort.id) && !ids.has(cohort.id), "cohort: unique anonymous ID required");
    ids.add(cohort.id);
    fail(cohort.job === "public_repository_bounded_fix", "unsupported customer job");
    fail(["owned_domain", "openai_directory", "github_marketplace"].includes(cohort.channel), "unsupported channel");
    fail(cohort.population === "external_customers", "publisher/test activity cannot enter a customer cohort");
    fail(day(cohort.startedOn) && day(cohort.observedThrough) && cohort.startedOn <= cohort.observedThrough && cohort.observedThrough <= asOf, "cohort: invalid or future observation window");
    exact(cohort.counts, counts, "counts");
    for (const name of counts) fail(Number.isSafeInteger(cohort.counts[name]) && cohort.counts[name] >= 0 && cohort.counts[name] <= 1_000_000, `counts: invalid ${name}`);
    const c = cohort.counts;
    fail(c.participants > 0, "planned/empty cohorts are not customer observations; use an empty cohorts array");
    fail(c.connected <= c.participants && c.attempted <= c.connected && c.usefulVerified <= c.attempted, "activation counts exceed their denominators");
    fail(c.repeatEligible <= c.usefulVerified && c.usefulRepeat <= c.repeatEligible, "repeat counts exceed eligible useful-result customers");
    fail(c.offerShown <= c.participants && c.paymentCommitted <= c.offerShown && c.paid <= c.paymentCommitted, "payment counts exceed offer/commitment denominators");
    fail(c.repeatEligible === 0 || Date.parse(cohort.observedThrough) - Date.parse(cohort.startedOn) >= 7 * 86400000, "repeat eligibility requires at least seven observation days");
    exact(cohort.blockers, blockers, "blockers");
    for (const name of blockers) fail(Number.isSafeInteger(cohort.blockers[name]) && cohort.blockers[name] >= 0 && cohort.blockers[name] <= c.participants, `blockers: invalid ${name}`);
    fail(Array.isArray(cohort.evidence) && cohort.evidence.length > 0 && cohort.evidence.length <= 100, "cohort: evidence references required");
    const kinds = new Set();
    const hashes = new Set();
    for (const evidence of cohort.evidence) {
      exact(evidence, ["kind", "sha256"], "evidence");
      fail(["intake", "customer_accepted_verified_result", "repeat_result", "written_price_acceptance", "payment_receipt", "support_record"].includes(evidence.kind), "unsupported evidence kind");
      fail(/^[a-f0-9]{64}$/.test(evidence.sha256) && !hashes.has(evidence.sha256), "evidence: unique SHA256 reference required");
      hashes.add(evidence.sha256); kinds.add(evidence.kind);
    }
    for (const [name, kind] of [["participants", "intake"], ["usefulVerified", "customer_accepted_verified_result"], ["usefulRepeat", "repeat_result"], ["paymentCommitted", "written_price_acceptance"], ["paid", "payment_receipt"], ["supportMinutes", "support_record"]]) {
      fail(c[name] === 0 || kinds.has(kind), `missing evidence kind: ${kind}`);
    }
    // Keep windows independent. Do not sum cohorts into unique-user totals:
    // this anonymous store cannot detect a customer counted in two cohorts.
    const key = `${cohort.job}:${cohort.channel}`;
    const group = groups.get(key) ?? { job: cohort.job, channel: cohort.channel, cohorts: [] };
    group.cohorts.push({ id: cohort.id, startedOn: cohort.startedOn, observedThrough: cohort.observedThrough, counts: c,
      activationRate: rate(c.usefulVerified, c.participants), attemptSuccessRate: rate(c.usefulVerified, c.attempted),
      repeatRate: rate(c.usefulRepeat, c.repeatEligible), writtenCommitmentRate: rate(c.paymentCommitted, c.offerShown),
      paidConversionRate: rate(c.paid, c.offerShown), supportMinutesPerUsefulResult: rate(c.supportMinutes, c.usefulVerified),
      blockers: cohort.blockers, nextAction: nextAction(c, cohort.blockers) });
    groups.set(key, group);
  }
  return { schema: "donestate.market-fit-review.v1", asOf, evidenceState: input.cohorts.length ? "manual_observations" : "not_observed",
    marketFit: "not_established", evidenceLimit: "Anonymous operator-entered aggregates and hash references are not independently audited proof; channels and cohorts are not pooled into unique-user totals.",
    groups: [...groups.values()], nextAction: input.cohorts.length ? "Review each cohort's largest evidenced constraint; change one variable and observe the next comparable cohort." : "Recruit the first consenting external cohort for one bounded public-repository fix; no customer demand or conversion is established by publisher acceptance." };
}

function nextAction(c, friction) {
  const top = Object.entries(friction).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (top) return `Investigate evidenced blocker: ${top[0]} (${top[1]} participants).`;
  if (c.participants === 0) return "Collect external customer intake evidence.";
  if (c.usefulVerified === 0) return "Observe the first customer-accepted independently verified result and record where attempts stop.";
  if (c.repeatEligible === 0) return "Wait for actual seven-day repeat eligibility; unobserved retention is not zero retention.";
  if (c.usefulRepeat === 0) return "Ask eligible customers about their next comparable job and why they did not return.";
  if (c.offerShown === 0) return "Test a clearly scoped priced offer; willingness to pay is unobserved.";
  if (c.paid === 0) return "Separate written price acceptance from an actual payment; test the recorded commercial objection.";
  return "Repeat the same job and offer with a new comparable external cohort; early paid repeat use does not establish market fit.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    fail(process.argv.length === 3, "usage: node scripts/review-market-fit.mjs COHORTS.json");
    const source = await readFile(process.argv[2], "utf8");
    fail(Buffer.byteLength(source) <= 1_000_000, "input too large");
    console.log(JSON.stringify(reviewMarketFit(JSON.parse(source)), null, 2));
  } catch {
    // Do not echo input, paths or a parser error containing private source text.
    console.error("Market-fit review rejected: check the documented schema, counts, dates and evidence references.");
    process.exitCode = 1;
  }
}

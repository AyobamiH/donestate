import test from "node:test";
import assert from "node:assert/strict";
import { reviewMarketFit } from "./review-market-fit.mjs";

const fixture = () => ({ schema: "donestate.market-fit-cohorts.v1", cohorts: [{
  id: "c-20261001-01", job: "public_repository_bounded_fix", channel: "owned_domain", population: "external_customers",
  startedOn: "2026-10-01", observedThrough: "2026-10-09",
  counts: { participants: 5, connected: 4, attempted: 3, usefulVerified: 2, repeatEligible: 1, usefulRepeat: 1, offerShown: 2, paymentCommitted: 1, paid: 1, supportMinutes: 20 },
  blockers: { oauth: 0, credential_funding: 1, repository_permission: 0, objective_clarity: 0, execution: 0, verification: 0, cost: 0, value: 0, private_repository: 0 },
  evidence: ["intake", "customer_accepted_verified_result", "repeat_result", "written_price_acceptance", "payment_receipt", "support_record"].map((kind, i) => ({ kind, sha256: String(i + 1).repeat(64) }))
}] });

test("empty evidence is unobserved and never promoted from publisher launch to market fit", () => {
  const result = reviewMarketFit({ schema: "donestate.market-fit-cohorts.v1", cohorts: [] }, "2026-10-09");
  assert.equal(result.evidenceState, "not_observed"); assert.equal(result.marketFit, "not_established"); assert.deepEqual(result.groups, []);
  const planned = fixture(); for (const key of Object.keys(planned.cohorts[0].counts)) planned.cohorts[0].counts[key] = 0;
  for (const key of Object.keys(planned.cohorts[0].blockers)) planned.cohorts[0].blockers[key] = 0;
  assert.throws(() => reviewMarketFit(planned, "2026-10-09"), /empty cohorts/);
});
test("review computes denominators and evidence-based friction without pooling customers", () => {
  const data = fixture(); const second = structuredClone(data.cohorts[0]); second.id = "c-20261001-02"; second.channel = "github_marketplace"; data.cohorts.push(second);
  const result = reviewMarketFit(data, "2026-10-09"); assert.equal(result.groups.length, 2);
  const c = result.groups[0].cohorts[0]; assert.equal(c.activationRate, 0.4); assert.equal(c.repeatRate, 1); assert.equal(c.paidConversionRate, 0.5); assert.equal(c.supportMinutesPerUsefulResult, 10);
  assert.match(c.nextAction, /credential_funding/); assert.equal(result.marketFit, "not_established"); assert.equal(result.totalUniqueUsers, undefined);
});
test("unknown repeat eligibility and untested payment denominators remain null", () => {
  const data = fixture(); Object.assign(data.cohorts[0].counts, { repeatEligible: 0, usefulRepeat: 0, offerShown: 0, paymentCommitted: 0, paid: 0 });
  const c = reviewMarketFit(data, "2026-10-09").groups[0].cohorts[0]; assert.equal(c.repeatRate, null); assert.equal(c.paidConversionRate, null);
});
test("test population, future/immature observation windows and duplicate cohorts are rejected", () => {
  for (const mutate of [d => d.cohorts[0].population = "publisher", d => d.cohorts[0].observedThrough = "2026-10-10", d => d.cohorts[0].startedOn = "2026-10-08", d => d.cohorts.push(structuredClone(d.cohorts[0]))]) {
    const data = fixture(); mutate(data); assert.throws(() => reviewMarketFit(data, "2026-10-09"));
  }
});
test("impossible conversions and payment without receipt evidence fail closed", () => {
  for (const mutate of [d => d.cohorts[0].counts.usefulVerified = 4, d => d.cohorts[0].counts.usefulRepeat = 2, d => d.cohorts[0].counts.paid = 2, d => d.cohorts[0].evidence = d.cohorts[0].evidence.filter(e => e.kind !== "payment_receipt")]) {
    const data = fixture(); mutate(data); assert.throws(() => reviewMarketFit(data, "2026-10-09"));
  }
});
test("extra personal-data fields, unsafe evidence references and impossible dates are rejected", () => {
  for (const mutate of [d => d.cohorts[0].email = "customer@example.test", d => d.cohorts[0].evidence[0].sha256 = "https://example.test/?token=secret", d => d.cohorts[0].startedOn = "2026-02-30"]) {
    const data = fixture(); mutate(data); assert.throws(() => reviewMarketFit(data, "2026-10-09"));
  }
});

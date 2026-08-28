import { describe, expect, it } from "vitest";
import { canonicalJson, digest, redact } from "../src/canonical";
import type { HostedObjective } from "../src/types";
import { assertRef, assertRepository, validateHostedObjective } from "../src/validation";

function objective(overrides: Partial<HostedObjective> = {}): HostedObjective {
  return {
    schema: "donestate.hosted-objective.v1",
    runId: "11111111-1111-4111-8111-111111111111",
    repository: "owner/repository",
    baseRef: "main",
    baseHeadSha: "a".repeat(40),
    goal: "Implement the requested behaviour.",
    acceptanceCriteria: ["Tests pass."],
    requestedBy: "operator",
    authorities: ["local_read", "local_write", "test", "commit", "push", "secret_access"],
    validationProfile: "auto",
    publication: "branch",
    trustedVerifierFingerprints: [],
    verificationRequirements: [],
    maxChangedFiles: 100,
    maxDurationMs: 1_800_000,
    ...overrides,
  };
}

describe("hosted objective admission", () => {
  it("requires publication authority without widening it", () => {
    expect(() => validateHostedObjective(objective({
      publication: "pull_request",
      authorities: ["local_read", "local_write", "test", "commit", "secret_access"],
    }))).toThrow("push authority is required");
    expect(() => validateHostedObjective(objective({
      publication: "pull_request",
      authorities: ["local_read", "local_write", "test", "commit", "push", "open_pr", "secret_access"],
    }))).not.toThrow();
  });

  it("rejects shell-shaped repository and ref inputs", () => {
    expect(() => assertRepository("owner/repo;curl" )).toThrow();
    expect(() => assertRef("main && echo unsafe")).toThrow();
    expect(() => assertRef("feature/safe-name")).not.toThrow();
  });

  it("requires complete machine-checkable coverage for trusted verification", () => {
    const fingerprint = "b".repeat(64);
    expect(() => validateHostedObjective(objective({ trustedVerifierFingerprints: [fingerprint] })))
      .toThrow("trusted verification requires machine-checkable verificationRequirements");
    expect(() => validateHostedObjective(objective({
      trustedVerifierFingerprints: [fingerprint],
      verificationRequirements: [{
        id: "tests_pass",
        criterionIndex: 0,
        kind: "github_checks_pass",
        requiredNames: ["CI"],
      }],
    }))).not.toThrow();
  });

  it("rejects verification requirements that escape the repository or widen budgets", () => {
    expect(() => validateHostedObjective(objective({
      verificationRequirements: [{ id: "unsafe", criterionIndex: 0, kind: "path_exists", path: "../secret" }],
    }))).toThrow("safe repository-relative paths");
    expect(() => validateHostedObjective(objective({
      maxChangedFiles: 5,
      verificationRequirements: [{
        id: "too_broad",
        criterionIndex: 0,
        kind: "changed_files",
        max: 6,
        allowedPaths: ["README.md"],
      }],
    }))).toThrow("invalid changed-file boundary");
  });

  it("forces autonomous maintenance into the PR-only authority lane", () => {
    expect(() => validateHostedObjective(objective({ objectiveClass: "maintenance_pr", publication: "branch" })))
      .toThrow("maintenance objectives must publish a pull request");
    expect(() => validateHostedObjective(objective({
      objectiveClass: "maintenance_pr",
      publication: "pull_request",
      authorities: ["local_read", "local_write", "test", "commit", "push", "open_pr", "secret_access"],
    }))).not.toThrow();
  });
});

describe("canonical evidence", () => {
  it("is stable across object key order", async () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(await digest({ b: 2, a: 1 })).toBe(await digest({ a: 1, b: 2 }));
  });

  it("redacts recognisable credentials", () => {
    expect(redact("token=example-value password:hunter2")).toBe("token=[REDACTED] password=[REDACTED]");
  });
});

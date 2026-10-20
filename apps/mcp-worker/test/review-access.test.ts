import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { DoneStateEnv } from "../src/environment";
import type { CredentialVault } from "../src/credential-vault";
import { VERIFICATION_CONTRACT_VERSION, type HostedObjective } from "../src/types";
import { createCredentialSetup, credentialSettingsHandler } from "../src/credential-settings";
import {
  OPENAI_REVIEW_LOGIN, assertReviewIdentity, assertReviewObjective, assertReviewSelection,
  prepareReviewAccount, repositoryActor, reviewRepository,
} from "../src/review-access";

const repository = "AyobamiH/donestate-review-fixture";
const config = {
  ...env, PLATFORM_OWNER_LOGIN: "AyobamiH", OPENAI_REVIEW_REPOSITORY: repository,
  OPSTRUTH_VERIFIER_FINGERPRINT: "a".repeat(64),
} as DoneStateEnv;

function objective(): HostedObjective {
  return {
    schema: "donestate.hosted-objective.v1", runId: crypto.randomUUID(), repository,
    baseRef: "main", baseHeadSha: "b".repeat(40), goal: "Repair the demo fixture.",
    acceptanceCriteria: ["The fixture contains the corrected value."], requestedBy: OPENAI_REVIEW_LOGIN,
    authorities: ["local_read", "local_write", "test", "commit", "push", "open_pr", "secret_access"],
    validationProfile: "node", publication: "pull_request", verificationContractVersion: VERIFICATION_CONTRACT_VERSION,
    trustedVerifierFingerprints: ["a".repeat(64)],
    verificationRequirements: [{ id: "value", criterionIndex: 0, kind: "file_contains", path: "fixture.json", values: ["correct"] }],
    maxChangedFiles: 5, maxDurationMs: 300_000,
  };
}

describe("isolated reviewer access", () => {
  it("admits the new reviewer and normal customers, but refuses legacy owner-mapped or unmarked review identities", () => {
    expect(() => assertReviewIdentity({ login: OPENAI_REVIEW_LOGIN, reviewMode: true })).not.toThrow();
    expect(() => assertReviewIdentity({ login: "AyobamiH" })).not.toThrow();
    expect(() => assertReviewIdentity({ login: "AyobamiH", reviewMode: true })).toThrow("reconnect");
    expect(() => assertReviewIdentity({ login: OPENAI_REVIEW_LOGIN })).toThrow("reconnect");
  });

  it("delegates publisher repository access only for the exact dedicated fixture", () => {
    expect(repositoryActor(OPENAI_REVIEW_LOGIN, repository, config)).toBe("AyobamiH");
    expect(repositoryActor("alice", "alice/repo", config)).toBe("alice");
    expect(() => repositoryActor(OPENAI_REVIEW_LOGIN, "AyobamiH/donestate", config)).toThrow("demo repository");
    expect(() => reviewRepository({ ...config, OPENAI_REVIEW_REPOSITORY: "AyobamiH/donestate" })).toThrow("dedicated");
    expect(() => reviewRepository({ ...config, OPENAI_REVIEW_REPOSITORY: undefined })).toThrow("not configured");
  });

  it("allows manual fixture selection and refuses outside repositories and unattended scheduling", () => {
    const selection = { repository, scheduleEnabled: false, autoRepair: false };
    expect(() => assertReviewSelection(OPENAI_REVIEW_LOGIN, selection, config)).not.toThrow();
    for (const change of [{ repository: "AyobamiH/donestate" }, { scheduleEnabled: true }, { autoRepair: true }]) {
      expect(() => assertReviewSelection(OPENAI_REVIEW_LOGIN, { ...selection, ...change }, config)).toThrow("BLOCKED_AUTHORITY");
    }
  });

  it("admits a real bounded PR objective with the pinned independent verifier", () => {
    expect(() => assertReviewObjective(objective(), config)).not.toThrow();
  });

  it.each([
    { repository: "AyobamiH/donestate" }, { publication: "branch" },
    { authorities: ["local_read", "merge"] }, { maxChangedFiles: 6 }, { maxDurationMs: 300_001 },
    { trustedVerifierFingerprints: [] }, { trustedVerifierFingerprints: ["c".repeat(64)] },
  ])("rejects expanded reviewer authority: %j", (change) => {
    expect(() => assertReviewObjective({ ...objective(), ...change } as HostedObjective, config)).toThrow("BLOCKED_AUTHORITY");
  });

  it("provisions only the isolated credential and selection, never reads the publisher vault", async () => {
    const storeCredential = vi.fn(async () => ({}));
    const getByName = vi.fn(() => ({
      requireAccountWritable: async () => ({ generation: 7 }), status: async () => ({ connected: false }), storeCredential,
    }));
    const selectRepository = vi.fn(async () => ({ installationId: 123 }));
    const provision = {
      ...config, OPENAI_REVIEW_EXECUTION_KEY: "fixture-only-test-credential",
      CREDENTIAL_VAULT: { getByName },
      MAINTENANCE_REGISTRY: { getByName: () => ({ listRepositories: async () => [], selectRepository }) },
    } as unknown as DoneStateEnv;
    await prepareReviewAccount(provision);
    expect(getByName).toHaveBeenCalledExactlyOnceWith(OPENAI_REVIEW_LOGIN);
    expect(storeCredential).toHaveBeenCalledExactlyOnceWith(OPENAI_REVIEW_LOGIN, "fixture-only-test-credential", 7);
    expect(selectRepository).toHaveBeenCalledWith(OPENAI_REVIEW_LOGIN, expect.objectContaining({ repository, mode: "pr_only", scheduleEnabled: false }));
    await expect(prepareReviewAccount({ ...provision, OPENAI_REVIEW_EXECUTION_KEY: undefined })).rejects.toThrow("not configured");
  });

  it("keeps the funded demo limit after credential removal and account deletion", async () => {
    const vault = env.CREDENTIAL_VAULT.getByName("review-quota-regression");
    await vault.storeCredential(OPENAI_REVIEW_LOGIN, "fixture-only-test-credential");
    for (let index = 0; index < 3; index++) {
      await vault.acquire(OPENAI_REVIEW_LOGIN, `run-${index}`, 60_000);
      await vault.release(OPENAI_REVIEW_LOGIN, `run-${index}`);
    }
    await vault.disconnect(OPENAI_REVIEW_LOGIN);
    await vault.beginAccountDeletion();
    await vault.purgeAccount(OPENAI_REVIEW_LOGIN);
    await vault.storeCredential(OPENAI_REVIEW_LOGIN, "fixture-only-replacement");
    expect(await vault.status(OPENAI_REVIEW_LOGIN)).toMatchObject({ dailyRunsUsed: 3, dailyRunLimit: 3 });
    await runInDurableObject(vault, async (instance: CredentialVault) => {
      await expect(instance.acquire(OPENAI_REVIEW_LOGIN, "run-four", 60_000)).rejects.toThrow("daily autonomous-run limit");
    });
  });

  it("opens the real account-settings path as the isolated reviewer and refuses ticket replay", async () => {
    const setup = await createCredentialSetup(config, OPENAI_REVIEW_LOGIN, "https://done.example");
    const response = await credentialSettingsHandler.fetch(new Request(setup.setupUrl), config);
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    const replay = await credentialSettingsHandler.fetch(new Request(setup.setupUrl), config);
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect((await env.CREDENTIAL_VAULT.getByName("AyobamiH").status("AyobamiH")).connected).toBe(false);
  });
});

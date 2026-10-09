import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverMaintenanceCandidates, getRepositoryAccess, GitHubError } from "../src/github";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("repository write admission", () => {
  it.each([true, false])("preserves OAuth push permission %s without an App actor lookup", async (canPush) => {
    const request = vi.fn(async () => Response.json({
      default_branch: "main", private: false, permissions: { push: canPush },
    }));
    vi.stubGlobal("fetch", request);
    expect(await getRepositoryAccess("oauth-test-token", "owner/repository")).toEqual({
      defaultBranch: "main", private: false, canPush,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["write", "admin"])("admits an authorised App-backed %s user when repository push metadata is absent", async (permission) => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer installation-test-token" });
      if (String(input).endsWith("/collaborators/Customer/permission")) {
        return Response.json({ permission, user: { login: "customer" } });
      }
      return Response.json({ default_branch: "main", private: true });
    });
    vi.stubGlobal("fetch", request);
    expect(await getRepositoryAccess("installation-test-token", "owner/repository", "Customer")).toEqual({
      defaultBranch: "main", private: true, canPush: true,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each(["read", "none", "unknown", undefined])("rejects an App-backed user role %s even if App metadata says push", async (permission) => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith("/permission")
        ? Response.json({ permission, user: { login: "Customer" } })
        : Response.json({ default_branch: "main", private: false, permissions: { push: true } });
    }));
    expect((await getRepositoryAccess("installation-test-token", "owner/repository", "Customer")).canPush).toBe(false);
  });

  it.each(["different-customer", undefined])("rejects permission evidence for a mismatched or missing identity %s", async (login) => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith("/permission")
        ? Response.json({ permission: "write", user: { login } })
        : Response.json({ default_branch: "main", private: false });
    }));
    expect((await getRepositoryAccess("installation-test-token", "owner/repository", "Customer")).canPush).toBe(false);
  });

  it("fails closed when the App cannot read collaborator authority", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      return String(input).endsWith("/permission")
        ? Response.json({ message: "Not Found" }, { status: 404 })
        : Response.json({ default_branch: "main", private: false, permissions: { push: true } });
    }));
    await expect(getRepositoryAccess("installation-test-token", "owner/repository", "Customer"))
      .rejects.toBeInstanceOf(GitHubError);
  });
});

describe("maintenance discovery", () => {
  it("reads only labeled issues and failing workflow evidence with bounded issue text", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.method).toBeUndefined();
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toMatchObject({ Authorization: "Bearer installation-token" });
      if (url.includes("/issues?")) {
        expect(url).toContain("labels=donestate%3Arepair");
        return Response.json([
          { number: 7, title: "Repair the parser", body: "x".repeat(5_000), html_url: "https://github.com/owner/repository/issues/7" },
          { number: 8, title: "A pull request", body: "ignored", html_url: "https://github.com/owner/repository/pull/8", pull_request: {} },
        ]);
      }
      if (url.includes("/actions/runs?")) {
        expect(url).toContain("status=failure");
        return Response.json({ workflow_runs: [{
          id: 90,
          name: "CI",
          display_title: "failed test",
          html_url: "https://github.com/owner/repository/actions/runs/90",
          head_sha: "a".repeat(40),
        }] });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", request);

    const candidates = await discoverMaintenanceCandidates("installation-token", "owner/repository");

    expect(request).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ source: "github_issue", sourceId: "7", repairEligible: true });
    expect(candidates[0]?.detail).toHaveLength(4_000);
    expect(candidates[1]).toMatchObject({ source: "workflow_run", sourceId: "90", repairEligible: false });
  });
});

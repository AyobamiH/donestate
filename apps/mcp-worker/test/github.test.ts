import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverMaintenanceCandidates } from "../src/github";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

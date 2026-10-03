import { describe, expect, it } from "vitest";
import { renderAccountRuns } from "../src/account-presentation";

describe("account objective presentation", () => {
  it("escapes untrusted repository and identifier text without creating executable markup", () => {
    const output = renderAccountRuns([{ runId: '<script>alert("x")</script>', repository: '<img src=x onerror=alert(1)>', state: "AMBIGUOUS_EFFECT", updatedAt: "<bad>" }]);
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("<img");
    expect(output).toContain("&lt;bad&gt;");
    expect(output).toContain("do not blindly retry");
    expect(output).toContain("get_objective");
  });
  it("does not misrepresent unavailable records as completed or deleted", () => {
    const output = renderAccountRuns([{ runId: "missing", repository: "owner/repo", state: "MISSING", updatedAt: "2026-10-03" }]);
    expect(output).toContain("does not prove the objective was deleted or completed");
    expect(renderAccountRuns([])).toContain("No indexed objectives");
  });
});

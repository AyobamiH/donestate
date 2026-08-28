import { describe, expect, it } from "vitest";
import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, decodeChangedFiles, protectedMaintenancePath } from "../src/executor";

describe("hosted Codex executor contract", () => {
  it("places global flags before exec and transports the objective as one argument", () => {
    expect(CODEX_IMPLEMENT_COMMAND).toBe(
      "codex --ask-for-approval never --config 'shell_environment_policy.inherit=\"core\"' exec --json --sandbox workspace-write --ephemeral --ignore-user-config \"$DONESTATE_OBJECTIVE\"",
    );
    expect(CODEX_IMPLEMENT_COMMAND.indexOf("--ask-for-approval")).toBeLessThan(
      CODEX_IMPLEMENT_COMMAND.indexOf(" exec "),
    );
    expect(CODEX_IMPLEMENT_COMMAND).toContain("shell_environment_policy.inherit");
    expect(CODEX_IMPLEMENT_COMMAND).toContain("\"$DONESTATE_OBJECTIVE\"");
    expect(CODEX_IMPLEMENT_COMMAND).not.toMatch(/\s-\s*$/);
  });

  it("counts a complete NUL-delimited changed-file inventory without duplicates", () => {
    const encoded = btoa("README.md\0docs/TRUST-MODEL.md\0new-file.md\0README.md\0");

    expect(decodeChangedFiles(encoded)).toEqual([
      "README.md",
      "docs/TRUST-MODEL.md",
      "new-file.md",
    ]);
    expect(CHANGED_FILES_COMMAND).toContain("git diff --name-only -z HEAD");
    expect(CHANGED_FILES_COMMAND).toContain("git ls-files --others --exclude-standard -z");
    expect(CHANGED_FILES_COMMAND).toContain("base64 -w0");
  });

  it("blocks autonomous maintenance from protected authority surfaces", () => {
    expect(protectedMaintenancePath("AGENTS.md")).toBe(true);
    expect(protectedMaintenancePath(".github/workflows/ci.yml")).toBe(true);
    expect(protectedMaintenancePath("docs/architecture/BOUNDARIES.md")).toBe(true);
    expect(protectedMaintenancePath("contracts/action.schema.json")).toBe(true);
    expect(protectedMaintenancePath("CODEOWNERS")).toBe(true);
    expect(protectedMaintenancePath("wrangler.toml")).toBe(true);
    expect(protectedMaintenancePath("src/bugfix.ts")).toBe(false);
  });
});

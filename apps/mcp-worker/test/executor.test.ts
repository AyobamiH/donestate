import { describe, expect, it } from "vitest";
import { CODEX_IMPLEMENT_COMMAND } from "../src/executor";

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
});

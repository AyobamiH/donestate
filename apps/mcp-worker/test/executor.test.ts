import { describe, expect, it } from "vitest";
import { CODEX_IMPLEMENT_COMMAND } from "../src/executor";

describe("hosted Codex executor contract", () => {
  it("places the pinned CLI approval flag before the exec subcommand", () => {
    expect(CODEX_IMPLEMENT_COMMAND).toBe(
      "codex --ask-for-approval never exec --json --sandbox workspace-write --ephemeral --ignore-user-config -",
    );
    expect(CODEX_IMPLEMENT_COMMAND.indexOf("--ask-for-approval")).toBeLessThan(
      CODEX_IMPLEMENT_COMMAND.indexOf(" exec "),
    );
  });
});

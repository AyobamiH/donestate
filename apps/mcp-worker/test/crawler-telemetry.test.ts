import { describe, expect, it, vi } from "vitest";
import { publicDiscoveryResponse, recordDiscoveryObservation } from "../src/crawler-telemetry";

describe("DoneState agent discovery telemetry", () => {
  it("serves bounded machine-discovery files only on the canonical host", async () => {
    const agents = publicDiscoveryResponse(
      new Request("https://donestate.proofandstate.com/agents.txt"),
    );
    expect(agents?.status).toBe(200);
    expect(await agents!.text()).toContain("https://donestate.proofandstate.com/mcp");
    expect(
      publicDiscoveryResponse(new Request("https://example.com/agents.txt")),
    ).toBeNull();
    expect(
      publicDiscoveryResponse(
        new Request("https://donestate.proofandstate.com/agents.txt", { method: "POST" }),
      ),
    ).toBeNull();
  });

  it("records only recognised crawler families with bounded fields", () => {
    const writeDataPoint = vi.fn();
    recordDiscoveryObservation(
      new Request("https://donestate.proofandstate.com/mcp?token=secret", {
        headers: { "user-agent": "GPTBot/1.2" },
      }),
      401,
      { DISCOVERY_ANALYTICS: { writeDataPoint } },
    );
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0]![0]).toEqual({
      indexes: ["donestate:openai_gptbot"],
      blobs: ["agent_discovery", "openai_gptbot", "mcp", "donestate", "GET"],
      doubles: [401],
    });
    expect(JSON.stringify(writeDataPoint.mock.calls[0]![0])).not.toContain("secret");

    recordDiscoveryObservation(
      new Request("https://donestate.proofandstate.com/mcp", {
        headers: { "user-agent": "ordinary-browser" },
      }),
      200,
      { DISCOVERY_ANALYTICS: { writeDataPoint } },
    );
    expect(writeDataPoint).toHaveBeenCalledOnce();
  });
});

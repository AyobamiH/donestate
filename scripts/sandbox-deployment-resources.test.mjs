import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { checkSandboxResources } from "../apps/mcp-worker/scripts/sandbox-resource-policy.mjs";

const config = (instance_type) => ({ containers: [{ class_name: "Sandbox", instance_type }] });

test("rejects the memory profiles below the measured compiler footprint", () => {
  for (const name of ["lite", "dev"]) {
    assert.throws(() => checkSandboxResources(config(name)), /256 MiB.*at least 512 MiB/);
  }
});

test("accepts supported profiles with room for repository validation", () => {
  for (const name of ["basic", "standard", "standard-1", "standard-2", "standard-3", "standard-4"]) {
    assert.ok(checkSandboxResources(config(name)).memoryMib >= 512);
  }
});

test("fails closed when the production Sandbox identity or capacity is unspecified", () => {
  for (const value of [{}, { containers: [] }, { containers: [{ class_name: "Unrelated", instance_type: "basic" }] }, { containers: [...config("basic").containers, ...config("standard-1").containers] }]) {
    assert.throws(() => checkSandboxResources(value), /exactly one Sandbox/);
  }
  for (const value of [undefined, null, "unknown", {}, 1024]) {
    assert.throws(() => checkSandboxResources(config(value)), /documented predefined/);
  }
});

test("the production configuration has sufficient capacity and a lite regression is rejected", () => {
  const source = readFileSync(new URL("../apps/mcp-worker/wrangler.jsonc", import.meta.url), "utf8");
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", source);
  assert.equal(parsed.error, undefined);
  assert.ok(checkSandboxResources(parsed.config).memoryMib >= 512);
  const regression = structuredClone(parsed.config);
  regression.containers.find((container) => container.class_name === "Sandbox").instance_type = "lite";
  assert.throws(() => checkSandboxResources(regression), /256 MiB.*at least 512 MiB/);
});

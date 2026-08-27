import assert from "node:assert/strict";
import test from "node:test";
import { redactOutput, truncateUtf8 } from "../redaction.js";

test("redacts explicit and recognisable secret material", () => {
  const secret = "super-secret-value";
  const output = redactOutput(`token=abc123456789 password:hunter2 ${secret}`, [secret]);
  assert.equal(output.includes(secret), false);
  assert.equal(output.includes("hunter2"), false);
  assert.match(output, /\[REDACTED\]/);
});

test("truncates output by byte budget", () => {
  const result = truncateUtf8("abcdefgh", 4);
  assert.deepEqual(result, { value: "abcd", truncated: true });
});

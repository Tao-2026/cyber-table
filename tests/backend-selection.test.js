import test from "node:test";
import assert from "node:assert/strict";
import { selectBackend } from "../src/config/backend-selection.js";

test("public hosts default to production Firebase", () => {
  assert.equal(selectBackend({ requested: null, hostname: "tao-2026.github.io" }), "firebase");
  assert.equal(selectBackend({ requested: null, hostname: "cyber-table.example" }), "firebase");
});

test("local development defaults to the local backend", () => {
  assert.equal(selectBackend({ requested: null, hostname: "localhost" }), "local");
  assert.equal(selectBackend({ requested: null, hostname: "127.0.0.1" }), "local");
});

test("an explicit valid backend overrides the host default", () => {
  assert.equal(selectBackend({ requested: "local", hostname: "tao-2026.github.io" }), "local");
  assert.equal(selectBackend({ requested: "firebase", hostname: "localhost" }), "firebase");
  assert.equal(selectBackend({ requested: "emulator", hostname: "localhost" }), "emulator");
});

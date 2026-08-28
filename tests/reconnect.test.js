import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("anonymous auth restoration completes before a new sign-in", async () => {
  const source = await readFile("src/services/firebase-service.js", "utf8");
  const ready = source.indexOf("await auth.authStateReady()");
  const signIn = source.lastIndexOf("await signInAnonymously(auth)");
  assert.ok(ready >= 0 && signIn > ready);
});

test("active room survives refresh and leaving explicitly clears it", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /sessionStorage\.getItem\(sessionKey\)/);
  assert.match(source, /sessionStorage\.setItem\(sessionKey, id\)/);
  assert.match(source, /sessionStorage\.removeItem\(sessionKey\)/);
  assert.match(source, /await api\.resume\(rememberedRoom\)/);
});

test("foreground and online transitions rebuild realtime listeners", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /addEventListener\("online"[\s\S]*restartRealtime\(\)/);
  assert.match(source, /addEventListener\("visibilitychange"[\s\S]*restartRealtime\(\)/);
  assert.match(source, /api\.probe\(roomId\)/);
});

test("transient offline restoration keeps the remembered room", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /!navigator\.onLine[\s\S]*await open\(rememberedRoom\)/);
  assert.match(source, /\["permission-denied", "not-found"\]/);
});

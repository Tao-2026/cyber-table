import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let env;
const projectId = "cyber-table-local";

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
beforeEach(async () => env.clearFirestore());
after(async () => env.cleanup());

async function seedRoom() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "rooms/ROOM1"), { hostId: "host", roomCode: "ABCDE", status: "playing", currentMatchId: "M1", memberIds: ["host","guest","watcher"], memberCount: 3, usedEmojis: ["🤖","🐼","🐰"], settings: { maxPlayers: 8 }, updatedAt: new Date() });
    for (const [id, seat] of [["host",0],["guest",1],["watcher",2]]) await setDoc(doc(db, `rooms/ROOM1/players/${id}`), { playerId: id, emoji: "🤖", seat, partyScore: 0, status: "active" });
    await setDoc(doc(db, "rooms/ROOM1/matches/M1"), { gameType: "tic-tac-toe", playerX: "host", playerO: "guest", board: Array(9).fill(null), currentTurn: "X", status: "playing", winner: null, moveCount: 0, createdAt: new Date(), updatedAt: new Date() });
  });
}

test("unauthenticated room access is rejected", async () => {
  await seedRoom();
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "rooms/ROOM1")));
});

test("authenticated player can get a room", async () => {
  await seedRoom();
  const snapshot = await assertSucceeds(getDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1")));
  assert.equal(snapshot.data().roomCode, "ABCDE");
});

test("a player cannot create another player's identity", async () => {
  await seedRoom();
  const db = env.authenticatedContext("guest").firestore();
  await assertFails(setDoc(doc(db, "rooms/ROOM1/players/impostor"), { playerId: "impostor", emoji: "🐼", seat: 3, partyScore: 0, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), status: "active" }));
});

test("spectator and non-current player moves are rejected", async () => {
  await seedRoom();
  const change = { board: ["X",null,null,null,null,null,null,null,null], currentTurn: "O", status: "playing", winner: null, moveCount: 1, updatedAt: serverTimestamp() };
  await assertFails(updateDoc(doc(env.authenticatedContext("watcher").firestore(), "rooms/ROOM1/matches/M1"), change));
  await assertFails(updateDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1/matches/M1"), change));
});

test("the current player may submit exactly one legal-looking move", async () => {
  await seedRoom();
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("host").firestore(), "rooms/ROOM1/matches/M1"), { board: ["X",null,null,null,null,null,null,null,null], currentTurn: "O", status: "playing", winner: null, moveCount: 1, updatedAt: serverTimestamp() }));
});

test("a move cannot overwrite a piece or change multiple cells", async () => {
  await seedRoom();
  const db = env.authenticatedContext("host").firestore();
  const matchRef = doc(db, "rooms/ROOM1/matches/M1");
  await assertFails(updateDoc(matchRef, { board: ["X","X",null,null,null,null,null,null,null], currentTurn: "O", status: "playing", winner: null, moveCount: 1, updatedAt: serverTimestamp() }));
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), "rooms/ROOM1/matches/M1"), { board: ["O",null,null,null,null,null,null,null,null] }));
  await assertFails(updateDoc(matchRef, { board: ["X",null,null,null,null,null,null,null,null], currentTurn: "O", status: "playing", winner: null, moveCount: 1, updatedAt: serverTimestamp() }));
});

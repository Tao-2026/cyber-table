import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { createFirebaseRoomService } from "../src/services/firebase-room-service.js";

let env;
const projectId = "cyber-table-local";

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
beforeEach(async () => env.clearFirestore());
after(async () => env.cleanup());

async function seedRoom({ board = Array(9).fill(null), currentTurn = "X", moveCount = 0 } = {}) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "rooms/ROOM1"), { hostId: "host", roomCode: "ABCDE", status: "playing", currentMatchId: "M1", currentSeriesId: "S1", roundNumber: 0, seriesNumber: 0, memberIds: ["host","guest","watcher"], memberCount: 3, playerCount: 2, spectatorCount: 1, activePlayerCount: 2, usedEmojis: ["🤖","🐼","🐰"], settings: { maxMembers: 8, maxPlayers: 8, maxActivePlayers: 6, seriesTargetWins: 2, maxSeriesRounds: 5 }, updatedAt: new Date() });
    for (const [id, seat] of [["host",0],["guest",1],["watcher",2]]) await setDoc(doc(db, `rooms/ROOM1/players/${id}`), { playerId: id, emoji: ["🤖","🐼","🐰"][seat], seat, role: id === "watcher" ? "spectator" : "player", requestedRole: null, joinedDuringSeries: id === "watcher", partyScore: 0, status: "active" });
    await setDoc(doc(db, "rooms/ROOM1/series/S1"), { playerA: "host", playerB: "guest", winsByPlayer: { host: 0, guest: 0 }, roundsPlayed: 0, targetWins: 2, maxRounds: 5, status: "playing", winnerId: null, pairingRoundNumber: 0, createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, "rooms/ROOM1/matches/M1"), { gameType: "tic-tac-toe", playerX: "host", playerO: "guest", board, currentTurn, status: "playing", winner: null, winningLine: [], moveCount, scoreApplied: false, roundNumber: 0, seriesId: "S1", seriesRoundNumber: 1, suggestionsMutedMoveCount: -1, createdAt: new Date(), updatedAt: new Date() });
  });
}

function moveChange(board, currentTurn, moveCount) {
  return { board, currentTurn, status: "playing", winner: null, winningLine: [], moveCount, scoreApplied: false, updatedAt: serverTimestamp() };
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

test("spectator and non-current player moves are rejected", async () => {
  await seedRoom();
  const change = moveChange(["X",null,null,null,null,null,null,null,null], "O", 1);
  await assertFails(updateDoc(doc(env.authenticatedContext("watcher").firestore(), "rooms/ROOM1/matches/M1"), change));
  await assertFails(updateDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1/matches/M1"), change));
});

test("non-members cannot read room subcollections", async () => {
  await seedRoom(); const outsider = env.authenticatedContext("outsider").firestore();
  await assertFails(getDoc(doc(outsider, "rooms/ROOM1/players/host")));
  await assertFails(getDoc(doc(outsider, "rooms/ROOM1/matches/M1")));
  await assertFails(getDoc(doc(outsider, "rooms/ROOM1/series/S1")));
});

test("a spectator cannot promote, score, manage, or move even when host", async () => {
  await seedRoom(); const watcher = env.authenticatedContext("watcher").firestore();
  await assertFails(updateDoc(doc(watcher, "rooms/ROOM1/players/watcher"), { role: "player", requestedRole: null, joinedDuringSeries: false, roleUpdatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(watcher, "rooms/ROOM1/players/watcher"), { partyScore: 99 }));
  await assertFails(updateDoc(doc(watcher, "rooms/ROOM1"), { status: "partyOver", updatedAt: serverTimestamp() }));
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), "rooms/ROOM1/players/host"), { role: "spectator" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("host").firestore(), "rooms/ROOM1/matches/M1"), moveChange(["X",null,null,null,null,null,null,null,null], "O", 1)));
});

test("the current player may submit one non-terminal move", async () => {
  await seedRoom();
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("host").firestore(), "rooms/ROOM1/matches/M1"), moveChange(["X",null,null,null,null,null,null,null,null], "O", 1)));
});

test("terminal move atomically settles score and round", async () => {
  await seedRoom({ board: ["X","X",null,"O","O",null,null,null,null], currentTurn: "X", moveCount: 4 });
  const db = env.authenticatedContext("host").firestore();
  await assertSucceeds(updateDoc(doc(db, "rooms/ROOM1/matches/M1"), { board: ["X","X","X","O","O",null,null,null,null], currentTurn: "X", status: "won", winner: "X", winningLine: [0,1,2], moveCount: 5, updatedAt: serverTimestamp() }));
  const batch = writeBatch(db); batch.update(doc(db, "rooms/ROOM1/matches/M1"), { scoreApplied: true, updatedAt: serverTimestamp() });
  batch.update(doc(db, "rooms/ROOM1/players/host"), { partyScore: 3 });
  batch.update(doc(db, "rooms/ROOM1/series/S1"), { winsByPlayer: { host: 1, guest: 0 }, roundsPlayed: 1, status: "playing", winnerId: null, updatedAt: serverTimestamp() });
  batch.update(doc(db, "rooms/ROOM1"), { status: "roundOver", updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
});

test("client cannot change scores independently or settle twice", async () => {
  await seedRoom();
  const db = env.authenticatedContext("host").firestore();
  await assertFails(updateDoc(doc(db, "rooms/ROOM1/players/host"), { partyScore: 99 }));
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await updateDoc(doc(admin, "rooms/ROOM1"), { status: "roundOver" });
    await updateDoc(doc(admin, "rooms/ROOM1/matches/M1"), { status: "draw", moveCount: 9, scoreApplied: true });
  });
  await assertFails(updateDoc(doc(db, "rooms/ROOM1/players/host"), { partyScore: 1 }));
});

test("non-host cannot start next match or end party", async () => {
  await seedRoom();
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), "rooms/ROOM1"), { status: "roundOver" }));
  const db = env.authenticatedContext("guest").firestore();
  await assertFails(updateDoc(doc(db, "rooms/ROOM1"), { status: "partyOver", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "rooms/ROOM1"), { status: "playing", currentMatchId: "M2", roundNumber: 1, updatedAt: serverTimestamp() }));
});

test("spectator suggestions are member-only and current-player controlled", async () => {
  await seedRoom();
  const watcherDb = env.authenticatedContext("watcher").firestore();
  const suggestion = doc(watcherDb, "rooms/ROOM1/matches/M1/suggestions/watcher");
  await assertSucceeds(setDoc(suggestion, { spectatorId: "watcher", spectatorEmoji: "🐰", suggestedCell: 4, moveCount: 0, status: "pending", createdAt: serverTimestamp(), resolvedAt: null, resolvedBy: null }));
  await assertFails(getDoc(doc(env.authenticatedContext("outsider").firestore(), "rooms/ROOM1/matches/M1/suggestions/watcher")));
  await assertFails(setDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1/matches/M1/suggestions/guest"), { spectatorId: "guest", spectatorEmoji: "🐼", suggestedCell: 5, moveCount: 0, status: "pending", createdAt: serverTimestamp(), resolvedAt: null, resolvedBy: null }));
  await assertFails(updateDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1/matches/M1/suggestions/watcher"), { status: "accepted", resolvedAt: serverTimestamp(), resolvedBy: "guest" }));
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("host").firestore(), "rooms/ROOM1/matches/M1/suggestions/watcher"), { status: "accepted", resolvedAt: serverTimestamp(), resolvedBy: "host" }));
  assert.equal((await getDoc(doc(env.authenticatedContext("host").firestore(), "rooms/ROOM1/matches/M1"))).data().board.every(cell => cell === null), true);
});

test("only current player may mute suggestions for the current move", async () => {
  await seedRoom();
  await assertFails(updateDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1/matches/M1"), { suggestionsMutedMoveCount: 0, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("host").firestore(), "rooms/ROOM1/matches/M1"), { suggestionsMutedMoveCount: 0, updatedAt: serverTimestamp() }));
});

test("legacy schema-v2 match finishes and upgrades on the next round", async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "rooms/LEGACY"), { hostId: "host", roomCode: "A1B2C", status: "playing", currentMatchId: "OLD1", roundNumber: 0, memberIds: ["host","guest"], memberCount: 2, usedEmojis: ["🤖","🐼"], settings: { maxPlayers: 8 }, updatedAt: new Date() });
    for (const [id, seat] of [["host",0],["guest",1]]) await setDoc(doc(db, `rooms/LEGACY/players/${id}`), { playerId: id, emoji: seat ? "🐼" : "🤖", seat, partyScore: 0, status: "active" });
    await setDoc(doc(db, "rooms/LEGACY/matches/OLD1"), { gameType: "tic-tac-toe", playerX: "host", playerO: "guest", board: ["X","X",null,"O","O",null,null,null,null], currentTurn: "X", status: "playing", winner: null, winningLine: [], moveCount: 4, scoreApplied: false, roundNumber: 0, createdAt: new Date(), updatedAt: new Date() });
  });
  const db = env.authenticatedContext("host").firestore();
  await assertSucceeds(updateDoc(doc(db, "rooms/LEGACY/matches/OLD1"), { board: ["X","X","X","O","O",null,null,null,null], currentTurn: "X", status: "won", winner: "X", winningLine: [0,1,2], moveCount: 5, updatedAt: serverTimestamp() }));
  const batch = writeBatch(db); batch.update(doc(db, "rooms/LEGACY/matches/OLD1"), { scoreApplied: true, updatedAt: serverTimestamp() });
  batch.update(doc(db, "rooms/LEGACY/players/host"), { partyScore: 3 }); batch.update(doc(db, "rooms/LEGACY"), { status: "roundOver", updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(createFirebaseRoomService({ db, uid: "host" }).nextMatch("LEGACY"));
  const upgraded = (await getDoc(doc(db, "rooms/LEGACY"))).data(); assert.equal(upgraded.status, "playing"); assert.ok(upgraded.currentSeriesId);
});

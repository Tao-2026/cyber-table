import test from "node:test";
import assert from "node:assert/strict";
import { deleteApp } from "firebase/app";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { createFirebaseServices, localEmulatorConfig } from "../src/services/firebase-service.js";
import { createFirebaseRoomService } from "../src/services/firebase-room-service.js";

async function identities(count, label) {
  const services = await Promise.all(Array.from({ length: count }, (_, index) => createFirebaseServices({ config: localEmulatorConfig, emulator: true, appName: `${label}-${index}-${Date.now()}` })));
  return { services, apis: services.map(createFirebaseRoomService) };
}
const data = async (db, ...path) => (await getDoc(doc(db, ...path))).data();
async function playMoves(apisByUid, db, roomId, moves) {
  for (const index of moves) {
    const room = await data(db, "rooms", roomId); const match = await data(db, "rooms", roomId, "matches", room.currentMatchId);
    await apisByUid.get(match.currentTurn === "X" ? match.playerX : match.playerO).move(roomId, room.currentMatchId, index);
  }
}

test("best-of-three keeps the pair, settles once, and gates next series", async () => {
  const { services, apis } = await identities(2, "series-two"); const [host, guest] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("S2P01"); await guest.join(" s2-p01 ");
    let room = await data(db, "rooms", roomId); assert.equal(room.settings.seriesTargetWins, 2); assert.equal(room.settings.maxSeriesRounds, 5);
    await host.updateSeriesSetting(roomId, 3); await host.updateSeriesSetting(roomId, 2); await assert.rejects(() => guest.updateSeriesSetting(roomId, 1), /Host only/);
    await host.start(roomId); await assert.rejects(() => host.updateSeriesSetting(roomId, 1), /locked/);
    const byUid = new Map(apis.map(api => [api.uid, api])); await playMoves(byUid, db, roomId, [0,3,1,4,2]);
    room = await data(db, "rooms", roomId); let series = await data(db, "rooms", roomId, "series", room.currentSeriesId);
    assert.equal(room.status, "roundOver"); assert.equal(series.roundsPlayed, 1); assert.equal(series.winsByPlayer[host.uid], 1); await assert.rejects(() => host.endParty(roomId), /Series is not over/);
    const attempts = await Promise.allSettled([host.nextMatch(roomId), host.nextMatch(roomId)]); assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
    room = await data(db, "rooms", roomId); const match = await data(db, "rooms", roomId, "matches", room.currentMatchId); assert.deepEqual(new Set([match.playerX, match.playerO]), new Set([host.uid, guest.uid]));
    await playMoves(byUid, db, roomId, [0,3,1,4,8,5]); room = await data(db, "rooms", roomId); series = await data(db, "rooms", roomId, "series", room.currentSeriesId);
    assert.equal(room.status, "seriesOver"); assert.equal(series.status, "won"); assert.equal(series.winnerId, host.uid);
    const players = (await getDocs(collection(db, "rooms", roomId, "players"))).docs.map(item => item.data()); assert.equal(players.find(item => item.playerId === host.uid).partyScore, 6);
    await host.endParty(roomId); assert.equal((await data(db, "rooms", roomId)).status, "partyOver");
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("roles lock at start and spectator suggestions never place a move", async () => {
  const { services, apis } = await identities(3, "roles-suggestions"); const [host, guest, spectator] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("ROLE1"); await guest.join("ROLE1"); await spectator.join("ROLE1");
    await assert.rejects(() => guest.setRole(roomId, spectator.uid, "spectator"), /Cannot change/);
    await host.setRole(roomId, guest.uid, "spectator"); await host.setRole(roomId, guest.uid, "player");
    assert.equal((await data(db, "rooms", roomId, "players", guest.uid)).partyScore, 0);
    await spectator.setRole(roomId, spectator.uid, "spectator");
    assert.equal((await data(db, "rooms", roomId, "players", spectator.uid)).role, "spectator"); await host.updateSeriesSetting(roomId, 1); await host.start(roomId);
    await assert.rejects(() => spectator.setRole(roomId, spectator.uid, "player"), /locked/); const room = await data(db, "rooms", roomId); let match = await data(db, "rooms", roomId, "matches", room.currentMatchId);
    await assert.rejects(() => guest.suggest(roomId, room.currentMatchId, 4), /Spectators only/); await spectator.suggest(roomId, room.currentMatchId, 4); await new Promise(resolve => setTimeout(resolve, 520)); await spectator.suggest(roomId, room.currentMatchId, 5);
    let suggestion = await data(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions", spectator.uid); assert.equal(suggestion.suggestedCell, 5); assert.equal(suggestion.status, "pending");
    await assert.rejects(() => guest.resolveSuggestion(roomId, room.currentMatchId, spectator.uid, "accepted"), /Current player only/); await host.resolveSuggestion(roomId, room.currentMatchId, spectator.uid, "accepted");
    match = await data(db, "rooms", roomId, "matches", room.currentMatchId); suggestion = await data(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions", spectator.uid); assert.equal(match.board.every(cell => cell === null), true); assert.equal(suggestion.status, "accepted");
    await host.muteSuggestions(roomId, room.currentMatchId); assert.equal((await data(db, "rooms", roomId, "matches", room.currentMatchId)).suggestionsMutedMoveCount, 0);
    await host.move(roomId, room.currentMatchId, 0); await new Promise(resolve => setTimeout(resolve, 520)); await assert.rejects(() => spectator.suggest(roomId, room.currentMatchId, 0), /empty square/); await assert.rejects(() => spectator.move(roomId, room.currentMatchId, 1), /Not your turn/);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("three active players rotate only after a series and concurrent next series creates one", async () => {
  const { services, apis } = await identities(3, "series-rotate"); const [host, guest, third] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("ROT31"); await guest.join("ROT31"); await third.join("ROT31"); await host.updateSeriesSetting(roomId, 1); await host.start(roomId);
    const byUid = new Map(apis.map(api => [api.uid, api])); await playMoves(byUid, db, roomId, [0,3,1,4,2]); let room = await data(db, "rooms", roomId); assert.equal(room.status, "seriesOver");
    const attempts = await Promise.allSettled([host.nextSeries(roomId), host.nextSeries(roomId)]); assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
    room = await data(db, "rooms", roomId); const match = await data(db, "rooms", roomId, "matches", room.currentMatchId); assert.deepEqual(new Set([match.playerX, match.playerO]), new Set([host.uid, third.uid]));
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("member resumes and probe restores match, series, roles and suggestions", async () => {
  const { services, apis } = await identities(3, "resume-series"); const [host, guest, spectator] = apis;
  try {
    const roomId = await host.create("RSM31"); await guest.join("RSM31"); await spectator.join("RSM31"); await spectator.setRole(roomId, spectator.uid, "spectator"); await host.start(roomId);
    let probe = await spectator.probe(roomId); await spectator.suggest(roomId, probe.currentMatchId, 8); probe = await spectator.probe(roomId);
    assert.equal(await spectator.resume(roomId), roomId); assert.equal(probe.series.targetWins, 2); assert.equal(probe.players.find(item => item.playerId === spectator.uid).role, "spectator"); assert.equal(probe.suggestions[0].suggestedCell, 8);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("short-code collisions retry finitely and exhaustion is recoverable", async () => {
  const { services, apis } = await identities(1, "code-collision"); const [host] = apis;
  try {
    await host.create("COLL2"); let calls = 0;
    const roomId = await host.create(null, 2, () => ++calls === 1 ? "COLL2" : "FRESH");
    assert.ok(roomId); assert.equal(calls, 2);
    await assert.rejects(() => host.create(null, 2, () => "COLL2"), /Please try again/);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

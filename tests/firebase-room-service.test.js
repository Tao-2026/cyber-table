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
    assert.equal(room.status, "seriesBreak"); assert.equal(series.status, "won"); assert.equal(series.winnerId, host.uid);
    const players = (await getDocs(collection(db, "rooms", roomId, "players"))).docs.map(item => item.data()); assert.equal(players.find(item => item.playerId === host.uid).partyScore, 6);
    await host.endParty(roomId); assert.equal((await data(db, "rooms", roomId)).status, "partyOver");
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("raised hands require current-player approval before one suggested cell", async () => {
  const { services, apis } = await identities(3, "roles-suggestions"); const [host, guest, spectator] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("ROLE1"); await guest.join("ROLE1"); await spectator.join("ROLE1");
    await assert.rejects(() => guest.setRole(roomId, spectator.uid, "spectator"), /Cannot change/);
    await host.setRole(roomId, guest.uid, "spectator"); await host.setRole(roomId, guest.uid, "player");
    assert.equal((await data(db, "rooms", roomId, "players", guest.uid)).partyScore, 0);
    await spectator.setRole(roomId, spectator.uid, "spectator");
    assert.equal((await data(db, "rooms", roomId, "players", spectator.uid)).role, "spectator"); await host.updateSeriesSetting(roomId, 1); await host.start(roomId);
    await assert.rejects(() => spectator.setRole(roomId, spectator.uid, "player"), /locked/); const room = await data(db, "rooms", roomId); let match = await data(db, "rooms", roomId, "matches", room.currentMatchId);
    await spectator.raiseHand(roomId, room.currentMatchId); let suggestion = await data(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions", spectator.uid);
    assert.equal(suggestion.status, "raised"); assert.equal(suggestion.suggestedCell, null); await assert.rejects(() => spectator.suggestCell(roomId, room.currentMatchId, 4), /approve/);
    await assert.rejects(() => guest.reviewHand(roomId, room.currentMatchId, spectator.uid, "approved"), /Current player only/); await host.reviewHand(roomId, room.currentMatchId, spectator.uid, "approved");
    suggestion = await data(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions", spectator.uid); assert.equal(suggestion.status, "approved");
    await spectator.suggestCell(roomId, room.currentMatchId, 5); suggestion = await data(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions", spectator.uid); match = await data(db, "rooms", roomId, "matches", room.currentMatchId);
    assert.equal(suggestion.status, "suggested"); assert.equal(suggestion.suggestedCell, 5); assert.equal(match.board.every(cell => cell === null), true); await assert.rejects(() => spectator.suggestCell(roomId, room.currentMatchId, 6), /approve/);
    await host.move(roomId, room.currentMatchId, 0); match = await data(db, "rooms", roomId, "matches", room.currentMatchId); assert.equal(match.approvedSpectatorId, null); assert.equal(match.approvedSuggestionMoveCount, -1);
    await assert.rejects(() => spectator.suggestCell(roomId, room.currentMatchId, 1), /approve/); await spectator.raiseHand(roomId, room.currentMatchId); await guest.reviewHand(roomId, room.currentMatchId, spectator.uid, "approved");
    await assert.rejects(() => spectator.suggestCell(roomId, room.currentMatchId, 0), /empty/); await spectator.suggestCell(roomId, room.currentMatchId, 1);
    await assert.rejects(() => spectator.move(roomId, room.currentMatchId, 2), /Not your turn/);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("three active players rotate only after a series and concurrent next series creates one", async () => {
  const { services, apis } = await identities(3, "series-rotate"); const [host, guest, third] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("ROT31"); await guest.join("ROT31"); await third.join("ROT31"); await host.updateSeriesSetting(roomId, 1); await host.start(roomId);
    const byUid = new Map(apis.map(api => [api.uid, api])); await playMoves(byUid, db, roomId, [0,3,1,4,2]); let room = await data(db, "rooms", roomId); assert.equal(room.status, "seriesBreak");
    const attempts = await Promise.allSettled([host.nextSeries(roomId), host.nextSeries(roomId)]); assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
    room = await data(db, "rooms", roomId); const match = await data(db, "rooms", roomId, "matches", room.currentMatchId); assert.deepEqual(new Set([match.playerX, match.playerO]), new Set([host.uid, third.uid]));
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("multiple raised hands queue independently and only one is approved per turn", async () => {
  const { services, apis } = await identities(4, "hand-queue"); const [host, guest, first, second] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("HANDS"); await guest.join("HANDS", "player"); await first.join("HANDS", "spectator"); await second.join("HANDS", "spectator"); await host.start(roomId);
    const room = await data(db, "rooms", roomId); await Promise.all([first.raiseHand(roomId, room.currentMatchId), second.raiseHand(roomId, room.currentMatchId)]);
    let suggestions = (await getDocs(collection(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions"))).docs.map(item => item.data()); assert.equal(suggestions.filter(item => item.status === "raised").length, 2);
    await host.reviewHand(roomId, room.currentMatchId, first.uid, "approved"); await assert.rejects(() => host.reviewHand(roomId, room.currentMatchId, second.uid, "approved"), /already approved/);
    suggestions = (await getDocs(collection(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions"))).docs.map(item => item.data()); assert.equal(suggestions.find(item => item.spectatorId === second.uid).status, "raised");
    await host.reviewHand(roomId, room.currentMatchId, second.uid, "dismissed"); await first.suggestCell(roomId, room.currentMatchId, 4); assert.equal((await data(db, "rooms", roomId, "matches", room.currentMatchId)).board[4], null);
    assert.equal((await data(db, "rooms", roomId, "matches", room.currentMatchId, "suggestions", second.uid)).status, "dismissed");
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("member resumes and probe restores match, series, roles and suggestions", async () => {
  const { services, apis } = await identities(3, "resume-series"); const [host, guest, spectator] = apis;
  try {
    const roomId = await host.create("RSM31"); await guest.join("RSM31"); await spectator.join("RSM31"); await spectator.setRole(roomId, spectator.uid, "spectator"); await host.start(roomId);
    let probe = await spectator.probe(roomId); await spectator.raiseHand(roomId, probe.currentMatchId); probe = await spectator.probe(roomId);
    assert.equal(await spectator.resume(roomId), roomId); assert.equal(probe.series.targetWins, 2); assert.equal(probe.players.find(item => item.playerId === spectator.uid).role, "spectator"); assert.equal(probe.suggestions[0].status, "raised");
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

test("one room code accepts explicit roles and active games downgrade new players", async () => {
  const { services, apis } = await identities(4, "unified-entry"); const [host, guest, lobbySpectator, late] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("ENTRY");
    assert.equal((await guest.join("ENTRY", "player")).role, "player");
    assert.equal((await lobbySpectator.join("ENTRY", "spectator")).role, "spectator");
    let room = await data(db, "rooms", roomId); assert.deepEqual([room.memberCount, room.playerCount, room.spectatorCount], [3,2,1]);
    await host.start(roomId);
    const result = await late.join("ENTRY", "player");
    assert.deepEqual({ role: result.role, downgraded: result.downgraded, reason: result.reason }, { role: "spectator", downgraded: true, reason: "gameStarted" });
    const latePlayer = await data(db, "rooms", roomId, "players", late.uid); assert.equal(latePlayer.joinedDuringSeries, true);
    room = await data(db, "rooms", roomId); assert.deepEqual([room.memberCount, room.playerCount, room.spectatorCount], [4,2,2]);
    const resumed = await late.join("ENTRY", "player"); assert.equal(resumed.role, "spectator");
    assert.equal((await data(db, "rooms", roomId)).memberCount, 4);
    const probe = await late.probe(roomId); assert.ok(probe.match); assert.ok(probe.series);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("series break queues a spectator, host approves, and next series can rotate them", async () => {
  const { services, apis } = await identities(3, "series-break-role"); const [host, guest, late] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("BREAK"); await guest.join("BREAK", "player"); await host.updateSeriesSetting(roomId, 1); await host.start(roomId);
    await late.join("BREAK", "spectator"); const byUid = new Map(apis.map(api => [api.uid, api])); await playMoves(byUid, db, roomId, [0,3,1,4,2]);
    await late.requestRole(roomId, "player"); assert.equal((await data(db, "rooms", roomId, "players", late.uid)).requestedRole, "player");
    await host.setRole(roomId, late.uid, "player"); let latePlayer = await data(db, "rooms", roomId, "players", late.uid);
    assert.equal(latePlayer.role, "player"); assert.equal(latePlayer.seat, 2); assert.equal(latePlayer.partyScore, 0);
    await guest.requestRole(roomId, "spectator"); assert.equal((await data(db, "rooms", roomId, "players", guest.uid)).role, "spectator");
    await host.nextSeries(roomId); const room = await data(db, "rooms", roomId); const match = await data(db, "rooms", roomId, "matches", room.currentMatchId);
    assert.deepEqual(new Set([match.playerX, match.playerO]), new Set([host.uid, late.uid]));
    latePlayer = await data(db, "rooms", roomId, "players", late.uid); assert.equal(latePlayer.joinedDuringSeries, false);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("concurrent joins cannot exceed eight members", async () => {
  const { services, apis } = await identities(9, "capacity-eight"); const [host, ...joiners] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("FULL8"); const results = await Promise.allSettled(joiners.map(api => api.join("FULL8", "spectator")));
    const succeeded = results.filter(item => item.status === "fulfilled").length; const failedApis = joiners.filter((_, index) => results[index].status === "rejected");
    let room = await data(db, "rooms", roomId); assert.equal(room.memberCount, succeeded + 1); assert.ok(room.memberCount <= 8);
    for (const api of failedApis.slice(0, 7 - succeeded)) await api.join("FULL8", "spectator");
    await assert.rejects(() => failedApis[7 - succeeded].join("FULL8", "spectator"), /full/i);
    room = await data(db, "rooms", roomId); assert.deepEqual([room.memberCount, room.playerCount, room.spectatorCount], [8,1,7]);
    assert.equal(new Set(room.memberIds).size, 8);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("selected avatar ids are unique, reconnect is idempotent, and conflicts return alternatives", async () => {
  const { services, apis } = await identities(5, "avatar-unique"); const [host, guest, watcher, first, second] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("AVTR1", "robot"); await guest.join("AVTR1", "player", "panda"); await watcher.join("AVTR1", "spectator", "bunny");
    assert.equal((await data(db, "rooms", roomId, "players", host.uid)).avatarId, "robot");
    assert.equal((await data(db, "rooms", roomId, "players", guest.uid)).avatarId, "panda");
    assert.equal((await data(db, "rooms", roomId, "players", watcher.uid)).avatarId, "bunny");
    const attempts = await Promise.allSettled([first.join("AVTR1", "spectator", "fox"), second.join("AVTR1", "spectator", "fox")]);
    assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
    const rejected = attempts.find(item => item.status === "rejected").reason; assert.equal(rejected.code, "avatar-taken"); assert.equal(rejected.availableAvatarIds.length, 3);
    const before = await data(db, "rooms", roomId); const resumed = await guest.join("AVTR1", "spectator", "tiger"); const after = await data(db, "rooms", roomId);
    assert.equal(resumed.role, "player"); assert.equal(after.memberCount, before.memberCount); assert.equal((await data(db, "rooms", roomId, "players", guest.uid)).avatarId, "panda");
    assert.equal(new Set(after.usedAvatarIds).size, after.usedAvatarIds.length); await assert.rejects(() => guest.join("AVTR1", "player", "not-valid"), /Invalid avatarId/);
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

test("an adopted winning suggestion records the spectator assist avatar", async () => {
  const { services, apis } = await identities(3, "avatar-assist"); const [host, guest, watcher] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("AST01", "robot"); await guest.join("AST01", "player", "panda"); await watcher.join("AST01", "spectator", "bunny"); await host.updateSeriesSetting(roomId, 1); await host.start(roomId);
    let room = await data(db, "rooms", roomId); await host.move(roomId, room.currentMatchId, 0); await guest.move(roomId, room.currentMatchId, 3); await host.move(roomId, room.currentMatchId, 1); await guest.move(roomId, room.currentMatchId, 4);
    await watcher.raiseHand(roomId, room.currentMatchId); await host.reviewHand(roomId, room.currentMatchId, watcher.uid, "approved"); await watcher.suggestCell(roomId, room.currentMatchId, 2); await host.move(roomId, room.currentMatchId, 2);
    room = await data(db, "rooms", roomId); const match = await data(db, "rooms", roomId, "matches", room.currentMatchId);
    assert.equal(match.status, "won"); assert.equal(match.assistSpectatorId, watcher.uid); assert.equal(match.assistAvatarId, "bunny");
  } finally { await Promise.all(services.map(service => deleteApp(service.app))); }
});

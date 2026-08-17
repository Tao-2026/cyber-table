import test from "node:test";
import assert from "node:assert/strict";
import { deleteApp } from "firebase/app";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { createFirebaseServices, localEmulatorConfig } from "../src/services/firebase-service.js";
import { createFirebaseRoomService } from "../src/services/firebase-room-service.js";

async function identities(count, label) {
  const services = await Promise.all(Array.from({ length: count }, (_, index) =>
    createFirebaseServices({ config: localEmulatorConfig, emulator: true, appName: `${label}-${index}-${Date.now()}` })
  ));
  return { services, apis: services.map(createFirebaseRoomService) };
}

async function roomData(db, roomId) {
  return (await getDoc(doc(db, "rooms", roomId))).data();
}

async function matchData(db, roomId, matchId) {
  return (await getDoc(doc(db, "rooms", roomId, "matches", matchId))).data();
}

async function playMoves(apisByUid, db, roomId, moves) {
  for (const index of moves) {
    const room = await roomData(db, roomId);
    const match = await matchData(db, roomId, room.currentMatchId);
    const uid = match.currentTurn === "X" ? match.playerX : match.playerO;
    await apisByUid.get(uid).move(roomId, room.currentMatchId, index);
  }
}

test("two UIDs draw, settle once, advance concurrently, win and end at podium state", async () => {
  const { services, apis } = await identities(2, "two-player");
  const [host, guest] = apis; const db = services[0].db;
  try {
    assert.notEqual(host.uid, guest.uid);
    const roomId = await host.create("T2P01");
    assert.equal(await guest.join("T2P01"), roomId);
    await assert.rejects(() => guest.start(roomId), /Host only/);
    await host.start(roomId);
    const byUid = new Map(apis.map(api => [api.uid, api]));
    await playMoves(byUid, db, roomId, [0,1,2,4,3,5,7,6,8]);

    let room = await roomData(db, roomId); let match = await matchData(db, roomId, room.currentMatchId);
    assert.equal(room.status, "roundOver");
    assert.equal(match.status, "draw");
    assert.equal(match.scoreApplied, true);
    const drawPlayers = (await getDocs(collection(db, "rooms", roomId, "players"))).docs.map(item => item.data());
    assert.deepEqual(drawPlayers.map(player => player.partyScore).sort(), [1,1]);
    await assert.rejects(() => host.move(roomId, room.currentMatchId, 0), /No active match/);
    await assert.rejects(() => guest.nextMatch(roomId), /Host only/);
    await assert.rejects(() => guest.endParty(roomId), /Host only/);

    const attempts = await Promise.allSettled([host.nextMatch(roomId), host.nextMatch(roomId)]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
    room = await roomData(db, roomId); match = await matchData(db, roomId, room.currentMatchId);
    assert.equal(room.status, "playing");
    assert.equal(room.roundNumber, 1);
    assert.equal(match.playerX, guest.uid);
    assert.equal(match.playerO, host.uid);
    assert.equal((await getDocs(collection(db, "rooms", roomId, "matches"))).size, 2);

    await playMoves(byUid, db, roomId, [0,3,1,4,2]);
    room = await roomData(db, roomId); match = await matchData(db, roomId, room.currentMatchId);
    assert.equal(match.status, "won");
    assert.deepEqual(match.winningLine, [0,1,2]);
    const scored = (await getDocs(collection(db, "rooms", roomId, "players"))).docs.map(item => item.data());
    assert.equal(scored.find(player => player.playerId === guest.uid).partyScore, 4);
    assert.equal(scored.find(player => player.playerId === host.uid).partyScore, 1);

    await host.endParty(roomId);
    assert.equal((await roomData(db, roomId)).status, "partyOver");
  } finally {
    await Promise.all(services.map(service => deleteApp(service.app)));
  }
});

test("three UIDs rotate through a new pairing while the third player spectates", async () => {
  const { services, apis } = await identities(3, "three-player");
  const [host, guest, third] = apis; const db = services[0].db;
  try {
    const roomId = await host.create("T3P01");
    await guest.join("T3P01"); await third.join("T3P01"); await host.start(roomId);
    const byUid = new Map(apis.map(api => [api.uid, api]));
    let room = await roomData(db, roomId); let match = await matchData(db, roomId, room.currentMatchId);
    assert.deepEqual([match.playerX, match.playerO], [host.uid, guest.uid]);
    await assert.rejects(() => third.move(roomId, room.currentMatchId, 8), /Not your turn/);
    await playMoves(byUid, db, roomId, [0,3,1,4,2]);
    await host.nextMatch(roomId);
    room = await roomData(db, roomId); match = await matchData(db, roomId, room.currentMatchId);
    assert.deepEqual(new Set([match.playerX, match.playerO]), new Set([host.uid, third.uid]));
    assert.equal(match.playerX, third.uid);
    assert.equal(room.roundNumber, 1);
  } finally {
    await Promise.all(services.map(service => deleteApp(service.app)));
  }
});

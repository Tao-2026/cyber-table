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
    await setDoc(doc(db, "rooms/ROOM1"), { hostId: "host", roomCode: "ABCDE", status: "playing", currentMatchId: "M1", currentSeriesId: "S1", roundNumber: 0, seriesNumber: 0, memberIds: ["host","guest","watcher"], memberCount: 3, playerCount: 2, spectatorCount: 1, activePlayerCount: 2, usedAvatarIds: ["robot","panda","bunny"], usedEmojis: ["🤖","🐼","🐰"], settings: { maxMembers: 8, maxPlayers: 8, maxActivePlayers: 6, seriesTargetWins: 2, maxSeriesRounds: 5 }, updatedAt: new Date() });
    for (const [id, seat] of [["host",0],["guest",1],["watcher",2]]) await setDoc(doc(db, `rooms/ROOM1/players/${id}`), { playerId: id, avatarId: ["robot","panda","bunny"][seat], emoji: ["🤖","🐼","🐰"][seat], seat, role: id === "watcher" ? "spectator" : "player", requestedRole: null, joinedDuringSeries: id === "watcher", partyScore: 0, status: "active" });
    await setDoc(doc(db, "rooms/ROOM1/series/S1"), { scoreApplied:false, playerA: "host", playerB: "guest", winsByPlayer: { host: 0, guest: 0 }, roundsPlayed: 0, targetWins: 2, maxRounds: 5, status: "playing", winnerId: null, pairingRoundNumber: 0, createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, "rooms/ROOM1/matches/M1"), { gameType: "tic-tac-toe", playerX: "host", playerO: "guest", board, currentTurn, status: "playing", winner: null, winningLine: [], moveCount, scoreApplied: false, roundNumber: 0, seriesId: "S1", seriesRoundNumber: 1, suggestionsMutedMoveCount: -1, approvedSpectatorId: null, approvedSuggestionMoveCount: -1, assistSpectatorId: null, assistAvatarId: null, createdAt: new Date(), updatedAt: new Date() });
  });
}

async function seedGomokuRoom() {
  await env.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    await setDoc(doc(db,"rooms/GOMOKU"),{hostId:"black",roomCode:"GO555",status:"playing",selectedGameType:"gomoku",activeGameType:"gomoku",gameSelectionVersion:1,currentMatchId:"GM1",currentSeriesId:"GS1",roundNumber:0,seriesNumber:0,memberIds:["black","white","watcher"],memberCount:3,playerCount:2,spectatorCount:1,activePlayerCount:2,usedAvatarIds:["robot","panda","bunny"],usedEmojis:["🤖","🐼","🐰"],settings:{maxMembers:8,maxPlayers:8,maxActivePlayers:6,seriesTargetWins:2,maxSeriesRounds:5},updatedAt:new Date()});
    for(const [id,seat] of [["black",0],["white",1],["watcher",2]])await setDoc(doc(db,`rooms/GOMOKU/players/${id}`),{playerId:id,avatarId:["robot","panda","bunny"][seat],emoji:["🤖","🐼","🐰"][seat],seat,role:id==="watcher"?"spectator":"player",requestedRole:null,joinedDuringSeries:id==="watcher",partyScore:0,status:"active"});
    await setDoc(doc(db,"rooms/GOMOKU/series/GS1"),{gameType:"gomoku",scoreApplied:false,playerA:"black",playerB:"white",winsByPlayer:{black:0,white:0},roundsPlayed:0,targetWins:2,maxRounds:5,status:"playing",winnerId:null,pairingRoundNumber:0,createdAt:new Date(),updatedAt:new Date()});
    await setDoc(doc(db,"rooms/GOMOKU/matches/GM1"),{gameType:"gomoku",playerBlack:"black",playerWhite:"white",currentTurn:"black",status:"playing",winner:null,winningProofCells:[],winDirection:null,winStart:null,moveCount:0,scoreApplied:false,roundNumber:0,seriesId:"GS1",seriesRoundNumber:1,lastMoveId:null,lastPlayerId:null,lastMoveRow:null,lastMoveColumn:null,suggestionsMutedMoveCount:-1,approvedSpectatorId:null,approvedSuggestionMoveCount:-1,assistSpectatorId:null,assistAvatarId:null,createdAt:new Date(),updatedAt:new Date()});
  });
}

async function seedGomokuAlmostDraw() {
  const board=Array.from({length:225},(_,index)=>{const row=Math.floor(index/15),column=index%15;return (row+Math.floor(column/2))%2?"black":"white";});
  board[224]=null;
  const lineCells=(type,lineIndex)=>Array.from({length:15},(_,position)=>{
    let row,column;
    if(type==="row"){row=lineIndex;column=position;}
    else if(type==="column"){row=position;column=lineIndex;}
    else if(type==="down"){row=position;column=position-lineIndex+14;}
    else{row=position;column=lineIndex-position;}
    return row>=0&&row<15&&column>=0&&column<15?board[row*15+column]:null;
  });
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),writes=[];
    for(const [type,count] of [["row",15],["column",15],["down",29],["up",29]])for(let lineIndex=0;lineIndex<count;lineIndex+=1)writes.push(setDoc(doc(db,`rooms/GOMOKU/matches/GM1/projections/${type}/lines/${lineIndex}`),{lineType:type,lineIndex,cells:lineCells(type,lineIndex),updatedAt:new Date()}));
    writes.push(updateDoc(doc(db,"rooms/GOMOKU/matches/GM1"),{currentTurn:"black",moveCount:224,lastMoveId:"move-224",lastPlayerId:"white",lastMoveRow:14,lastMoveColumn:13,updatedAt:new Date()}));
    await Promise.all(writes);
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

test("member avatars are immutable and invalid ids cannot join", async () => {
  await seedRoom(); const hostDb = env.authenticatedContext("host").firestore();
  await assertFails(updateDoc(doc(hostDb, "rooms/ROOM1/players/host"), { avatarId: "fox", emoji: "🦊" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("guest").firestore(), "rooms/ROOM1/players/host"), { avatarId: "panda" }));
  const outsiderDb = env.authenticatedContext("newcomer").firestore(); const batch = writeBatch(outsiderDb);
  batch.update(doc(outsiderDb, "rooms/ROOM1"), { memberIds: ["host","guest","watcher","newcomer"], memberCount: 4, playerCount: 2, spectatorCount: 2, activePlayerCount: 2, usedAvatarIds: ["robot","panda","bunny","not-valid"], usedEmojis: ["🤖","🐼","🐰","❓"], updatedAt: serverTimestamp() });
  batch.set(doc(outsiderDb, "rooms/ROOM1/players/newcomer"), { playerId: "newcomer", avatarId: "not-valid", emoji: "❓", seat: 3, role: "spectator", requestedRole: null, joinedDuringSeries: true, partyScore: 0, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), roleUpdatedAt: serverTimestamp(), status: "active" });
  await assertFails(batch.commit());
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

test("only the host selects a known game before a series and active game stays locked",async()=>{
  await seedRoom();const hostDb=env.authenticatedContext("host").firestore(),guestDb=env.authenticatedContext("guest").firestore(),ref=doc(hostDb,"rooms/ROOM1");
  await assertFails(updateDoc(doc(guestDb,"rooms/ROOM1"),{selectedGameType:"gomoku",gameSelectionVersion:1,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{selectedGameType:"chess",gameSelectionVersion:1,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{activeGameType:"gomoku",updatedAt:serverTimestamp()}));
  await env.withSecurityRulesDisabled(async context=>updateDoc(doc(context.firestore(),"rooms/ROOM1"),{status:"lobby"}));
  await assertSucceeds(updateDoc(ref,{selectedGameType:"gomoku",gameSelectionVersion:1,updatedAt:serverTimestamp()}));
});

test("spectator hand state is member-only, current-player approved, and never moves", async () => {
  await seedRoom(); const hostDb = env.authenticatedContext("host").firestore(); const watcherDb = env.authenticatedContext("watcher").firestore();
  const host = createFirebaseRoomService({ db: hostDb, uid: "host" }); const guest = createFirebaseRoomService({ db: env.authenticatedContext("guest").firestore(), uid: "guest" }); const watcher = createFirebaseRoomService({ db: watcherDb, uid: "watcher" });
  await assertSucceeds(watcher.raiseHand("ROOM1", "M1")); const ref = doc(watcherDb, "rooms/ROOM1/matches/M1/suggestions/watcher");
  assert.equal((await getDoc(ref)).data().status, "raised"); await assertFails(getDoc(doc(env.authenticatedContext("outsider").firestore(), "rooms/ROOM1/matches/M1/suggestions/watcher")));
  await assert.rejects(() => guest.reviewHand("ROOM1", "M1", "watcher", "approved"), /Current player/); await assert.rejects(() => watcher.suggestCell("ROOM1", "M1", 4), /approve/);
  await assertSucceeds(host.reviewHand("ROOM1", "M1", "watcher", "approved")); await assertSucceeds(watcher.suggestCell("ROOM1", "M1", 4));
  assert.equal((await getDoc(ref)).data().status, "suggested"); assert.equal((await getDoc(doc(hostDb, "rooms/ROOM1/matches/M1"))).data().board.every(cell => cell === null), true);
  await assertSucceeds(host.move("ROOM1", "M1", 0)); await assert.rejects(() => watcher.suggestCell("ROOM1", "M1", 5), /approve/);
  await assertSucceeds(watcher.raiseHand("ROOM1", "M1")); await assertSucceeds(guest.reviewHand("ROOM1", "M1", "watcher", "approved"));
  await assert.rejects(() => watcher.suggestCell("ROOM1", "M1", 0), /empty/); await assertSucceeds(watcher.suggestCell("ROOM1", "M1", 1));
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

test("schema-v3 rooms migrate counters when a late spectator joins", async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(); const expiresAt = new Date(Date.now() + 3600000);
    await setDoc(doc(db, "rooms/V3ROOM"), { hostId: "host", roomCode: "OLDV3", status: "playing", currentMatchId: "M1", currentSeriesId: "S1", roundNumber: 0, seriesNumber: 0, schemaVersion: 3, memberIds: ["host","guest"], memberCount: 2, activePlayerCount: 2, usedEmojis: ["🤖","🐼"], settings: { maxPlayers: 8, maxActivePlayers: 6, seriesTargetWins: 2, maxSeriesRounds: 5 }, updatedAt: new Date() });
    for (const [id, seat] of [["host",0],["guest",1]]) await setDoc(doc(db, `rooms/V3ROOM/players/${id}`), { playerId: id, emoji: seat ? "🐼" : "🤖", seat, role: "player", partyScore: 0, status: "active" });
    await setDoc(doc(db, "roomCodes/OLDV3"), { roomId: "V3ROOM", expiresAt });
  });
  const db = env.authenticatedContext("late").firestore(); const result = await createFirebaseRoomService({ db, uid: "late" }).join("OLDV3", "player");
  assert.deepEqual({ role: result.role, reason: result.reason }, { role: "spectator", reason: "gameStarted" });
  const migrated = (await getDoc(doc(db, "rooms/V3ROOM"))).data(); assert.deepEqual([migrated.memberCount, migrated.playerCount, migrated.spectatorCount], [3,2,1]);
});

test("Gomoku immutable moves enforce turn, role, coordinate and occupied-point rules",async()=>{
  await seedGomokuRoom();
  const blackDb=env.authenticatedContext("black").firestore();
  await assertFails(setDoc(doc(blackDb,"rooms/GOMOKU/matches/GM1/moves/move-2"),{moveNumber:2,moveId:"move-2",cellKey:112,playerId:"black",stone:"black",row:7,column:7,createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(blackDb,"rooms/GOMOKU/matches/GM1/moves/move-1"),{moveNumber:1,moveId:"move-1",cellKey:112,playerId:"black",stone:"white",row:7,column:7,createdAt:serverTimestamp()}));
  const black=createFirebaseRoomService({db:env.authenticatedContext("black").firestore(),uid:"black"});
  const white=createFirebaseRoomService({db:env.authenticatedContext("white").firestore(),uid:"white"});
  const watcher=createFirebaseRoomService({db:env.authenticatedContext("watcher").firestore(),uid:"watcher"});
  await assert.rejects(()=>white.moveGomoku("GOMOKU","GM1",7,7),/turn/);
  await assert.rejects(()=>watcher.moveGomoku("GOMOKU","GM1",7,7),/turn/);
  await assert.rejects(()=>black.moveGomoku("GOMOKU","GM1",15,0),/Invalid/);
  await assertSucceeds(black.moveGomoku("GOMOKU","GM1",7,7));
  await assert.rejects(()=>white.moveGomoku("GOMOKU","GM1",7,7),/occupied/);
  assert.equal((await getDoc(doc(blackDb,"rooms/GOMOKU/matches/GM1/moves/move-1"))).data().stone,"black");
  await assertFails(updateDoc(doc(blackDb,"rooms/GOMOKU/matches/GM1/moves/move-1"),{row:1}));
  await assertFails(getDoc(doc(env.authenticatedContext("outsider").firestore(),"rooms/GOMOKU/matches/GM1/moves/move-1")));
});

test("Gomoku result proof settles one five-in-a-row exactly once",async()=>{
  await seedGomokuRoom(); const blackDb=env.authenticatedContext("black").firestore(),whiteDb=env.authenticatedContext("white").firestore();
  const black=createFirebaseRoomService({db:blackDb,uid:"black"}),white=createFirebaseRoomService({db:whiteDb,uid:"white"});
  for(let column=3;column<7;column+=1){await black.moveGomoku("GOMOKU","GM1",7,column);await white.moveGomoku("GOMOKU","GM1",0,column-3);}
  await black.moveGomoku("GOMOKU","GM1",7,7);
  const match=(await getDoc(doc(blackDb,"rooms/GOMOKU/matches/GM1"))).data(),room=(await getDoc(doc(blackDb,"rooms/GOMOKU"))).data();
  assert.deepEqual([match.status,match.winner,match.scoreApplied,room.status],["won","black",true,"roundOver"]);
  assert.equal((await getDoc(doc(blackDb,"rooms/GOMOKU/players/black"))).data().partyScore,3);
  await assertFails(updateDoc(doc(blackDb,"rooms/GOMOKU/players/black"),{partyScore:6}));
});

test("Gomoku move 225 proves a no-five draw and awards each player once",async()=>{
  await seedGomokuRoom();await seedGomokuAlmostDraw();const blackDb=env.authenticatedContext("black").firestore(),black=createFirebaseRoomService({db:blackDb,uid:"black"});
  await assertSucceeds(black.moveGomoku("GOMOKU","GM1",14,14));
  const match=(await getDoc(doc(blackDb,"rooms/GOMOKU/matches/GM1"))).data(),room=(await getDoc(doc(blackDb,"rooms/GOMOKU"))).data(),blackPlayer=(await getDoc(doc(blackDb,"rooms/GOMOKU/players/black"))).data(),whitePlayer=(await getDoc(doc(blackDb,"rooms/GOMOKU/players/white"))).data();
  assert.deepEqual([match.status,match.winner,match.scoreApplied,room.status],["draw",null,true,"roundOver"]);assert.deepEqual([blackPlayer.partyScore,whitePlayer.partyScore],[1,1]);
  await assertFails(updateDoc(doc(blackDb,"rooms/GOMOKU/players/black"),{partyScore:2}));
});

test("concurrent Gomoku moves serialize and clients cannot forge terminal state",async()=>{
  await seedGomokuRoom();const blackDb=env.authenticatedContext("black").firestore(),black=createFirebaseRoomService({db:blackDb,uid:"black"});
  const outcomes=await Promise.allSettled([black.moveGomoku("GOMOKU","GM1",7,7),black.moveGomoku("GOMOKU","GM1",7,8)]);
  assert.equal(outcomes.filter(item=>item.status==="fulfilled").length,1);
  const matchRef=doc(blackDb,"rooms/GOMOKU/matches/GM1"),match=(await getDoc(matchRef)).data();
  assert.equal(match.moveCount,1);assert.equal(match.currentTurn,"white");
  await assertFails(updateDoc(matchRef,{status:"won",winner:"black",winningProofCells:[105,106,107,108,109],winDirection:"row",winStart:0,updatedAt:serverTimestamp()}));
});

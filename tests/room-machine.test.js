import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, joinRoom, startParty, playRoomMove, rotateRoom, podium } from "../src/core/room-machine.js";

function readyRoom() { return joinRoom(createRoom({ code: "ABCDE", hostId: "host", now: 0 }), "guest"); }
test("joins idempotently and assigns a unique emoji", () => { const room = readyRoom(); assert.equal(joinRoom(room, "guest").players.length, 2); assert.notEqual(room.players[0].emoji, room.players[1].emoji); });
test("requires host and two players to start", () => { assert.throws(() => startParty(createRoom({ code: "A", hostId: "h" }), "h")); assert.throws(() => startParty(readyRoom(), "guest"), /Host/); });
test("spectators and out-of-turn players cannot move", () => { const room = startParty(joinRoom(readyRoom(), "watcher"), "host"); assert.throws(() => playRoomMove(room, "watcher", 0), /turn/); assert.throws(() => playRoomMove(room, "guest", 0), /turn/); });
test("scores a win and rotates players", () => { let room = startParty(joinRoom(readyRoom(), "third"), "host"); for (const [id, cell] of [["host",0],["guest",3],["host",1],["guest",4],["host",2]]) room = playRoomMove(room, id, cell); assert.equal(room.players[0].score, 3); assert.equal(room.status, "roundOver"); room = rotateRoom(room, "host"); assert.deepEqual([room.match.playerX, room.match.playerO], ["guest", "third"]); });
test("podium sorts scores and keeps seat order for ties", () => { const room = readyRoom(); room.players[1].score = 3; assert.equal(podium(room)[0].id, "guest"); });

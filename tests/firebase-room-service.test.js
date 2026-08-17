import test from "node:test";
import assert from "node:assert/strict";
import { deleteApp } from "firebase/app";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { createFirebaseServices, localEmulatorConfig } from "../src/services/firebase-service.js";
import { createFirebaseRoomService } from "../src/services/firebase-room-service.js";

test("two anonymous identities create, join, start and make one transaction move", async () => {
  const hostServices = await createFirebaseServices({ config: localEmulatorConfig, emulator: true, appName: `host-${Date.now()}` });
  const guestServices = await createFirebaseServices({ config: localEmulatorConfig, emulator: true, appName: `guest-${Date.now()}` });
  try {
    assert.notEqual(hostServices.uid, guestServices.uid);
    const host = createFirebaseRoomService(hostServices);
    const guest = createFirebaseRoomService(guestServices);
    const roomId = await host.create("TST42");
    assert.equal(await guest.join("TST42"), roomId);
    const players = await getDocs(collection(hostServices.db, "rooms", roomId, "players"));
    assert.equal(players.size, 2);
    await host.start(roomId);
    const room = (await getDoc(doc(hostServices.db, "rooms", roomId))).data();
    assert.equal(room.status, "playing");
    await host.move(roomId, room.currentMatchId, 0);
    const match = (await getDoc(doc(hostServices.db, "rooms", roomId, "matches", room.currentMatchId))).data();
    assert.equal(match.board[0], "X");
    assert.equal(match.currentTurn, "O");
    assert.equal(match.moveCount, 1);
  } finally {
    await deleteApp(hostServices.app);
    await deleteApp(guestServices.app);
  }
});

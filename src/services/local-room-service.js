const prefix = "cyberTable.room.";
const channel = "BroadcastChannel" in globalThis ? new BroadcastChannel("cyberTable.rooms") : null;

export function generateRoomCode(random = Math.random) {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}
export function loadRoom(code) { const raw = localStorage.getItem(prefix + code); return raw ? JSON.parse(raw) : null; }
export function saveRoom(room) { localStorage.setItem(prefix + room.code, JSON.stringify(room)); channel?.postMessage(room.code); return room; }
export function watchRoom(code, listener) {
  const onStorage = event => { if (event.key === prefix + code) listener(loadRoom(code)); };
  const onChannel = event => { if (event.data === code) listener(loadRoom(code)); };
  addEventListener("storage", onStorage); channel?.addEventListener("message", onChannel);
  return () => { removeEventListener("storage", onStorage); channel?.removeEventListener("message", onChannel); };
}

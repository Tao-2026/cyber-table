export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function generateShortRoomCode(random = Math.random) {
  return Array.from({ length: ROOM_CODE_LENGTH }, () =>
    ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]
  ).join("");
}

export function normalizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]+/g, "");
}

export function isLegacyRoomCode(value) {
  return /^[A-Z0-9]{5}$/.test(normalizeRoomCode(value));
}

export function roomShareUrl(baseUrl, code) {
  const url = new URL(baseUrl);
  url.searchParams.set("room", normalizeRoomCode(code));
  return url.href;
}

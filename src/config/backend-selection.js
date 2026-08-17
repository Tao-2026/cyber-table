const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const VALID_BACKENDS = new Set(["local", "emulator", "firebase"]);

export function selectBackend({ requested, hostname }) {
  if (VALID_BACKENDS.has(requested)) return requested;
  return LOCAL_HOSTS.has(hostname) ? "local" : "firebase";
}

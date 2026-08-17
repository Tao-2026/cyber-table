import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

export async function createFirebaseServices({ config, emulator = false, appName = "cyber-table" }) {
  const app = getApps().find(candidate => candidate.name === appName) || initializeApp(config, appName);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (emulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
  return Object.freeze({ app, auth, db, uid: credential.user.uid });
}

export const localEmulatorConfig = Object.freeze({
  apiKey: "cyber-table-local-key",
  authDomain: "cyber-table-local.firebaseapp.com",
  projectId: "cyber-table-local",
  appId: "1:000000000000:web:cybertablelocal"
});

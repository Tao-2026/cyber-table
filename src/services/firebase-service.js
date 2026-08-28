import { initializeApp, getApps } from "firebase/app";
import { browserSessionPersistence, getAuth, connectAuthEmulator, inMemoryPersistence, setPersistence, signInAnonymously } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

export async function createFirebaseServices({ config, emulator = false, appName = "cyber-table" }) {
  const app = getApps().find(candidate => candidate.name === appName) || initializeApp(config, appName);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Emulator endpoints must be configured before auth restoration or any
  // Firestore operation initializes their production connections.
  if (emulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  // A party guest is a browser tab/session, not a shared browser profile.
  // Browser session persistence keeps identity across refreshes while still
  // allowing two tabs on the same device to join as separate players.
  await setPersistence(auth, typeof window === "undefined" ? inMemoryPersistence : browserSessionPersistence);
  // Persistence restoration is asynchronous. Signing in before it finishes can
  // replace the previous anonymous UID, making an in-progress room impossible
  // to resume after a refresh.
  await auth.authStateReady();
  const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
  return Object.freeze({ app, auth, db, uid: credential.user.uid });
}

export const localEmulatorConfig = Object.freeze({
  apiKey: "cyber-table-local-key",
  authDomain: "cyber-table-local.firebaseapp.com",
  projectId: "cyber-table-local",
  appId: "1:000000000000:web:cybertablelocal"
});

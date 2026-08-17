# Firebase development setup

Cyber Table must use its own Firebase project. Do not reuse CyberSnake credentials or project IDs.

## Local Emulator only

1. Install a supported Java runtime and Firebase CLI.
2. Start Auth and Firestore emulators with project ID `cyber-table-local`.
3. Run security-rule tests against the emulator before any production deployment.

Use `?backend=emulator` on the local app URL to connect the UI. Each browser tab stores a session-scoped emulator device ID so separate sessions receive independent anonymous users.

The committed `.firebaserc` name is an intentionally fake local project ID. No cloud project is created or selected by these files.

## Production boundary

Creating a Firebase project, deploying rules or indexes, enabling paid services, or upgrading to Blaze requires explicit owner approval. Keep the Spark plan and do not add Cloud Functions.

Firebase Web App configuration may be committed later, but admin credentials, CLI tokens, service-account JSON, cookies, and private keys must never enter this repository.

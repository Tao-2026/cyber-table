# Cyber Table release process

Cyber Table follows Semantic Versioning. Tags include the v prefix, while
package.json and APP_VERSION do not. Prereleases use -alpha.N, -beta.N, or -rc.N.

## Required release sequence

1. Confirm feature, security, mobile, desktop, and cross-device testing is complete.
2. Update src/config/version.js, package.json, and CHANGELOG.md together.
3. Run unit, Firestore Rules, and Firebase Emulator integration tests.
4. Run npm run test:version and npm run check:version.
5. Record the tested commit in CYBER_TABLE_EMULATOR_TESTED_COMMIT, then run npm run check:release.
6. Create and push a dedicated release commit.
7. Create a new annotated tag. Never overwrite an existing tag.
8. Push the tag without force.
9. Create the GitHub Release from that tag.
10. Create a local ZIP under archives/ and a SHA-256 checksum.
11. Verify the deployed product reports the expected version and links back to the Release.
12. Retain the release branch for audit and comparison.

## GitHub Release requirements

- Include the exact commit SHA.
- Include a Compare link to the preceding release or baseline.
- Summarize Added, Changed, Fixed, Security, and Known Issues from the changelog.
- Mark prereleases as prereleases. A beta must never be described as stable.
- Attach the ZIP and SHA-256 checksum when distribution archives are required.

## Safety rules

- Never force-push a release branch or tag.
- Never recreate, move, or overwrite a published tag.
- archives/ must remain outside Git.
- Release checks are read-only: they do not merge, tag, push, publish, or deploy.
- Firebase and GitHub Pages deployment remain separately authorized operations.

# Firebase setup for authentication and synchronized drafts

Milestone 7 uses Firebase Authentication and Cloud Firestore on the Spark plan. Firestore contains unpublished structured drafts and small editor preferences only. GitHub remains the future publication source of truth. Do not enable Firebase Storage, Hosting, Functions, Realtime Database, Extensions, Identity Platform upgrades, or Blaze billing for this setup.

## 1. Create the project and web application

1. Open the [Firebase Console](https://console.firebase.google.com/) and create or select the ArtaGatitului project.
2. Keep the project on the Spark plan.
3. In **Project settings > General**, register a Web App. Do not select Firebase Hosting.
4. Copy the Web App configuration values into `cms/.env.local`, using `cms/.env.example` as the template.
5. Never place passwords, service-account JSON, private keys, Admin SDK credentials, or GitHub tokens in that file.

The Firebase Web App configuration and UID allowlist are client-visible identifiers. They are not substitutes for Firestore Security Rules.

## 2. Configure authentication

1. Open **Authentication > Sign-in method** and enable **Email/Password** only.
2. In **Authentication > Users**, create the intended editor account manually.
3. Copy the account's immutable Firebase UID.
4. Set `VITE_FIREBASE_EDITOR_UIDS` in `cms/.env.local` to that UID. Multiple trusted UIDs are comma-separated.
5. Add `localhost`, `127.0.0.1`, and the packaged Tauri origin `tauri.localhost` to authorized domains only if Firebase reports an unauthorized-domain error.

There is no public registration flow. Authentication alone does not authorize Firestore access.

## 3. Create Firestore

1. Open **Build > Firestore Database** and choose **Create database**.
2. Select **Production mode**. Never start with public test-mode rules.
3. Choose the region closest to the intended editors. This location cannot be changed later, so confirm it before creation.
4. Do not create collections manually. The approved editor application creates documents after the rules are deployed.

## 4. Configure approved UIDs in rules

The committed `firestore.rules` deliberately contains this non-user placeholder:

```text
"APPROVED_FIREBASE_UID"
```

It keeps production in a safe-deny state until deployment is configured. Replace it locally or in the deployment change with the exact UID from Authentication. To trust another explicit editor, add another quoted UID to the same list. Do not replace the function with a generic authenticated-user check.

The client allowlist in `cms/.env.local` and the server allowlist in `firestore.rules` must contain the same intended editor UIDs. The server rules are the authorization boundary.

## 5. Test and deploy rules

Run the local rule suite against the demo-only emulator project:

```powershell
npm run test:firestore-rules
```

The Firestore emulator currently requires Java 21 or newer. The test command does not access production data.

Authenticate the Firebase CLI without committing private credentials:

```powershell
npx --yes firebase-tools@15.30.2 login
```

After replacing the approved UID placeholder, deploy only Firestore rules and indexes:

```powershell
npx --yes firebase-tools@15.30.2 deploy --only firestore:rules,firestore:indexes --project <firebase-project-id>
```

`firestore.indexes.json` is intentionally empty. The current draft list uses a single-field `updatedAt` ordering covered by Firestore's automatic indexes.

## 6. Verify authorization

1. Build or run the app with the configured `cms/.env.local`.
2. Sign in as an approved editor and create a draft.
3. Confirm the document appears at `workspaces/arta-gatitului/drafts/<draftId>`.
4. Confirm preferences appear only at `users/<approvedUid>/preferences/editor`.
5. Sign out and confirm Edit Mode is inaccessible while public View remains usable.
6. Sign in with a separate authenticated UID that is absent from both allowlists. Confirm the app rejects editor access and Firestore requests are denied.
7. Inspect a draft document and confirm it contains structured content, layout, metadata, and attachment metadata only. It must not contain base64, data URLs, image bytes, credentials, tokens, generated pages, or executable code.

## 7. Cross-device verification

After both Windows and Android builds use the same Firebase project and approved account:

1. Create and synchronize a draft on Windows.
2. Open Edit Mode on Android and verify that draft appears.
3. Edit and synchronize it on Android, then verify Windows receives the newer revision when its local version is clean.
4. Edit the same base revision independently on both devices. Confirm the second save shows the conflict dialog instead of overwriting the newer cloud revision.
5. Test **Use cloud version** and **Save mine as copy** separately.

Unpublished image bytes do not synchronize because Firebase Storage is intentionally disabled. Firestore retains image metadata, including source-device identity and future repository path, so another device can show that an attachment exists without pretending the local file is available.

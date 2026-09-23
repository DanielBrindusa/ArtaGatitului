# GitHub App setup

The repository-scoped GitHub App publishes new recipes and reviewed updates/deletions. Firebase login still decides who may enter Edit Mode; the GitHub connection separately decides whether this device may publish. The app never asks for a GitHub password or personal access token.

## Create and install the app

1. Open GitHub and go to **Settings**.
2. Open **Developer settings**.
3. Select **GitHub Apps**.
4. Select **New GitHub App**.
5. Enter a globally unique name, such as `ArtaGatitului Editor` plus a unique suffix.
6. Set **Homepage URL** to `https://danielbrindusa.github.io/ArtaGatitului/`.
7. Disable **Active** under Webhook. This milestone does not receive webhooks.
8. Enable **Device Flow**.
9. Keep expiring user authorization tokens enabled. The native service refreshes and rotates them.
10. Under **Repository permissions**, set **Contents** to **Read and write** and leave **Metadata** at **Read-only**. Set every other permission to **No access**. In particular, do not grant Administration, Actions, Workflows, Issues, or Pull requests.
11. Create the GitHub App and install it only on the intended `DanielBrindusa` account.
12. During installation choose **Only select repositories**, then select only `DanielBrindusa/ArtaGatitului`.
13. Return to the GitHub App settings page and copy its **Client ID**.
14. Set the non-secret `ARTA_GITHUB_APP_CLIENT_ID` environment variable before compiling the native app. For example, in PowerShell: `$env:ARTA_GITHUB_APP_CLIENT_ID = 'Iv1.example'`. Rebuild Windows and Android packages after changing it because the value is compiled into the native service.
15. Do not generate, embed, or configure a client secret. Device Flow and token refresh do not need one. Do not configure a classic PAT.
16. Launch the newly built installed application.
17. Sign in to Edit Mode with the separately configured Firebase editor account.
18. Select **Connect GitHub** in the editor toolbar.
19. Select **Open GitHub**, enter the displayed device code in the system browser, and authorize the GitHub App.
20. Return to the app and verify it reports `DanielBrindusa/ArtaGatitului` and branch `main`. If it reports a setup error, confirm the installation is limited to that single repository and has the exact permissions above.

The Client ID is public application configuration. Access and refresh tokens are not: Windows stores them in Windows Credential Manager and Android stores encrypted preferences protected by Android Keystore. They are never stored in `.env`, Firestore, local storage, logs, or React state.

## Publishing boundary

The publisher verifies repository ID `1256031473`, repository name `DanielBrindusa/ArtaGatitului`, selected-repository installation access, `Contents: write`, `Metadata: read`, and target branch `main`. It may read repository metadata and recipe source, and may modify only:

- `src/content/recipes/<slug>.json`
- `src/content/aliases.json`
- `assets/images/recipes/<slug>.jpg`, `.png`, or `.webp`

The review stores expected blob identities for affected paths. Unrelated `main` changes can be incorporated into a new tree, but a changed recipe, alias file, or destination stops confirmation. Recipe JSON, approved alias changes, and reviewed image changes are written through the Git Data API as one tree and one commit; the branch reference update uses non-force behavior. See `docs/published-recipe-editing.md` for rename, conflict, asset, and deletion safeguards. The editor records the resulting commit metadata in Firestore, but **Committed to GitHub** does not mean **Deployed to website**.

## Disconnect and revoke

**Disconnect GitHub** deletes the local access and refresh tokens from this device and clears the in-memory authorization state. It does not revoke authorization on GitHub and does not uninstall the GitHub App.

For full user-authorization revocation, open GitHub **Settings > Applications > Authorized GitHub Apps**, select the app, and revoke it. To remove repository access, open the account or organization **Settings > Applications > Installed GitHub Apps**, configure the app, and uninstall it or remove `DanielBrindusa/ArtaGatitului`. After either action, disconnect locally or reconnect so the application reports the new state.

## Verification notes

Automated tests use fixtures and never write to GitHub. A real publish test must use a deliberately designated non-production branch and must not be merged automatically. Windows and Android device checks require a configured GitHub App Client ID, an installed app, Firebase editor credentials, and an authorized GitHub account. Never test publication by creating a disposable recipe on production `main`.

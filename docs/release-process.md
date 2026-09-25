# Release process

## Version policy

Use semantic versioning `major.minor.patch` for the user-facing application. Increase major for incompatible data/workflow changes, minor for backward-compatible features, and patch for backward-compatible fixes. Keep the same version in `package.json`, `src-tauri/tauri.conf.json`, the root package in `src-tauri/Cargo.toml`, and `cms/src/app/release.ts`.

Android `versionCode` is `major * 1,000,000 + minor * 1,000 + patch`. Version `1.0.0` therefore uses `1000000`. Never reuse a lower version code for a distributed Android package.

## Preflight

From the repository root on `app-development`:

```powershell
npm ci
npm run doctor
npm audit
cargo audit --file src-tauri/Cargo.lock
npm run check:all
npm run test:firestore-rules
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Review `git diff`, run the credential searches in this document, and complete the manual checklist in `docs/final-setup-checklist.md`. Warnings from `npm run doctor` identify optional native tooling or missing shell configuration; failures must be fixed.

## Windows build

Build the configured Windows bundles:

```powershell
npm run tauri:build
```

Artifacts are under `src-tauri/target/release/bundle/`; the standalone executable is under `src-tauri/target/release/`. Test installation, launch, View/Edit switching, Firebase login, GitHub connection, resizing, keyboard navigation, and uninstall on a clean Windows user profile.

Windows signing is optional. A trusted code-signing certificate can reduce warnings but is not free infrastructure. Unsigned direct-download builds may trigger SmartScreen. Do not weaken Windows security or ship an embedded certificate/password to avoid that warning.

## Android debug build

Set the SDK/toolchain for the current shell, compile the arm64 debug package, and inspect the generated APK:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\<installed-version>"
npm run tauri:android:build -- --debug --target aarch64
```

Generated Android files and APKs are ignored by Git and must not be committed.

On Windows without Developer Mode, Tauri may compile the library and then fail only while creating the generated JNI symbolic link. Use the compiled library without rebuilding it:

```powershell
Copy-Item -LiteralPath 'src-tauri\target\aarch64-linux-android\debug\libartagatitului_lib.so' -Destination 'src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\libartagatitului_lib.so' -Force
Push-Location src-tauri\gen\android
.\gradlew.bat assembleArm64Debug -x rustBuildArm64Debug --no-daemon
Pop-Location
```

This fallback skips only the failed symlink task and packages the library produced by the immediately preceding Tauri command. Never reuse a stale library after source or configuration changes.

## Android production signing

Keep the keystore outside the repository. Do not put store/key passwords in source, documentation, command history, `cms/.env.local`, or committed Gradle files.

1. Back up the keystore and record its alias in a password manager.
2. Create `src-tauri/gen/android/keystore.properties` locally. The whole `src-tauri/gen/` directory is ignored:

```properties
storeFile=C:/absolute/path/outside/repository/production-keystore
storePassword=<read from password manager>
keyAlias=<keystore alias>
keyPassword=<read from password manager>
```

3. In the generated `src-tauri/gen/android/app/build.gradle.kts`, load the file before `android {}` and configure the release signing config:

```kotlin
import java.util.Properties

val keystoreProperties = Properties().apply {
    rootProject.file("keystore.properties").inputStream().use(::load)
}

android {
    signingConfigs {
        create("release") {
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

4. Build release with `npm run tauri:android:build -- --target aarch64`.
5. Verify with `$env:ANDROID_HOME\build-tools\<version>\apksigner.bat verify --verbose <apk>`.
6. Install on a test device and complete the Android checklist before distribution.

Regenerating the Android project may overwrite the local Gradle signing block. Reapply it from this procedure; do not move secrets into tracked configuration.

## Credential scan

Use pattern searches as a review aid, then inspect every result because setup documentation contains safe names and placeholders:

```powershell
git grep -n -I -E "(gh[pousr]_[A-Za-z0-9_]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|client_secret|refresh[_-]?token|storePassword|keyPassword)"
git ls-files "*.jks" "*.keystore" "*.pem" "*.key" "*.p12" "*.pfx"
```

Also verify no logs, screenshots, generated packages, local environment files, or Firebase service-account JSON are staged.

## Branch and production release

1. Commit release work to `app-development` and push without force.
2. Review the diff and CI result on GitHub.
3. Perform the external-service and real-device tests listed in `docs/final-setup-checklist.md`.
4. Merge to `main` manually only after review. The assistant must not merge or trigger a production release automatically.
5. Observe the `main` GitHub Actions validation and Pages deployment.
6. Attach installers/APKs to a GitHub Release later if desired. Do not commit binaries to source control.

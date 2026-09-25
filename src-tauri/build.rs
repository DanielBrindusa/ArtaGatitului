fn main() {
    println!("cargo:rerun-if-env-changed=ARTA_GITHUB_APP_CLIENT_ID");
    println!("cargo:rerun-if-changed=android/MainActivity.kt");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        std::fs::copy(
            "android/MainActivity.kt",
            "gen/android/app/src/main/java/ro/danielbrindusa/artagatitului/MainActivity.kt",
        )
        .expect("Could not install the Android activity with system-bar inset handling");
    }
    tauri_build::build()
}

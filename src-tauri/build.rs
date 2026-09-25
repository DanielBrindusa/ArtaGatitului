fn main() {
    println!("cargo:rerun-if-env-changed=ARTA_GITHUB_APP_CLIENT_ID");
    println!("cargo:rerun-if-changed=android/MainActivity.kt");
    println!("cargo:rerun-if-changed=android/rustls.gradle.kts");
    println!("cargo:rerun-if-changed=android/rustls.pro");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        std::fs::copy(
            "android/MainActivity.kt",
            "gen/android/app/src/main/java/ro/danielbrindusa/artagatitului/MainActivity.kt",
        )
        .expect("Could not install the Android activity with system-bar inset handling");
        std::fs::copy("android/rustls.pro", "gen/android/app/rustls.pro")
            .expect("Could not install Android TLS verifier keep rules");
        let gradle_path = "gen/android/app/build.gradle.kts";
        let mut gradle = std::fs::read_to_string(gradle_path)
            .expect("Initialize the Tauri Android project before building");
        let tls_setup = "apply(from = \"../../../android/rustls.gradle.kts\")";
        if !gradle.contains(tls_setup) {
            gradle.push_str(&format!("\n{tls_setup}\n"));
            std::fs::write(gradle_path, gradle)
                .expect("Could not install Android TLS verifier build configuration");
        }
    }
    tauri_build::build()
}

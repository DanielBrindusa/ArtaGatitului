fn main() {
    println!("cargo:rerun-if-env-changed=ARTA_GITHUB_APP_CLIENT_ID");
    tauri_build::build()
}

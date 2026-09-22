#[cfg(desktop)]
mod view_mode;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        );

    #[cfg(desktop)]
    let builder = builder
        .setup(|app| {
            view_mode::create_public_view(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            view_mode::set_view_bounds,
            view_mode::set_view_visibility,
            view_mode::navigate_view
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running the Arta Gatitului application");
}

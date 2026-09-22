mod github;
mod view_mode;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let secure_storage_error = github::initialize_secure_storage().err();
    let github_state = github::GithubState::new(secure_storage_error)
        .expect("the GitHub service must initialize without exposing credentials");
    let builder = tauri::Builder::default().manage(github_state).plugin(
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
            view_mode::navigate_view,
            github::github_get_connection_status,
            github::github_begin_device_flow,
            github::github_poll_device_flow,
            github::github_cancel_device_flow,
            github::github_open_device_page,
            github::github_disconnect,
            github::github_prepare_recipe_publish,
            github::github_publish_recipe
        ]);

    #[cfg(mobile)]
    let builder = builder
        .setup(|app| {
            view_mode::create_mobile_view(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            github::github_get_connection_status,
            github::github_begin_device_flow,
            github::github_poll_device_flow,
            github::github_cancel_device_flow,
            github::github_open_device_page,
            github::github_disconnect,
            github::github_prepare_recipe_publish,
            github::github_publish_recipe
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running the Arta Gatitului application");
}

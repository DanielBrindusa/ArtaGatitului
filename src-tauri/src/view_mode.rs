use serde::Deserialize;
use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    App, AppHandle, LogicalPosition, LogicalSize, Manager, Rect, Webview, WebviewUrl,
};
use tauri_plugin_opener::OpenerExt;

pub const PUBLIC_SITE_URL: &str = "https://danielbrindusa.github.io/ArtaGatitului/";
const PUBLIC_SITE_HOST: &str = "danielbrindusa.github.io";
const PUBLIC_SITE_PATH: &str = "/ArtaGatitului";
const PUBLIC_VIEW_LABEL: &str = "public-view";
const LOCAL_SHELL_LABEL: &str = "main";

const VIEW_INITIALIZATION_SCRIPT: &str = r#"
(() => {
  const trustedOrigin = 'https://danielbrindusa.github.io';
  const trustedPath = '/ArtaGatitului';
  const isTrusted = (url) =>
    url.origin === trustedOrigin &&
    (url.pathname === trustedPath || url.pathname.startsWith(`${trustedPath}/`));

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!anchor || anchor.target !== '_blank') return;

    try {
      const url = new URL(anchor.href, window.location.href);
      if (isTrusted(url)) {
        event.preventDefault();
        window.location.assign(url.href);
      }
    } catch (_) {
      event.preventDefault();
    }
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      window.history.back();
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      window.history.forward();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      window.location.reload();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
    }
  }, true);
})();
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn is_trusted_site_url(url: &tauri::Url) -> bool {
    let trusted_path = url.path() == PUBLIC_SITE_PATH || url.path().starts_with("/ArtaGatitului/");

    url.scheme() == "https"
        && url.host_str() == Some(PUBLIC_SITE_HOST)
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(url.port(), None | Some(443))
        && trusted_path
}

fn is_safe_external_url(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

fn open_external(app: &AppHandle, url: &tauri::Url) {
    if !is_safe_external_url(url) {
        eprintln!("Blocked unsupported external navigation scheme: {}", url.scheme());
        return;
    }

    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("Could not open external URL in the system browser: {error}");
    }
}

fn public_webview(app: &AppHandle) -> Result<Webview, String> {
    app.get_webview(PUBLIC_VIEW_LABEL)
        .ok_or_else(|| "Public View Mode is not available.".to_string())
}

fn require_local_shell(caller: &Webview) -> Result<(), String> {
    if caller.label() == LOCAL_SHELL_LABEL {
        Ok(())
    } else {
        Err("This command is restricted to the local application shell.".to_string())
    }
}

#[tauri::command]
pub fn set_view_bounds(
    caller: Webview,
    app: AppHandle,
    bounds: ViewBounds,
) -> Result<(), String> {
    require_local_shell(&caller)?;

    let values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if values.iter().any(|value| !value.is_finite())
        || bounds.x < 0.0
        || bounds.y < 0.0
        || bounds.width < 1.0
        || bounds.height < 1.0
        || bounds.width > 10_000.0
        || bounds.height > 10_000.0
    {
        return Err("Invalid public view bounds.".to_string());
    }

    public_webview(&app)?
        .set_bounds(Rect {
            position: LogicalPosition::new(bounds.x, bounds.y).into(),
            size: LogicalSize::new(bounds.width, bounds.height).into(),
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_view_visibility(
    caller: Webview,
    app: AppHandle,
    visible: bool,
) -> Result<(), String> {
    require_local_shell(&caller)?;
    let view = public_webview(&app)?;

    if visible {
        view.show()
    } else {
        view.hide()
    }
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn navigate_view(
    caller: Webview,
    app: AppHandle,
    action: String,
) -> Result<(), String> {
    require_local_shell(&caller)?;
    let view = public_webview(&app)?;

    match action.as_str() {
        "back" => view.eval("window.history.back()"),
        "forward" => view.eval("window.history.forward()"),
        "home" => view.navigate(
            PUBLIC_SITE_URL
                .parse()
                .map_err(|_| "The public site URL is invalid.".to_string())?,
        ),
        "reload" => view.reload(),
        _ => return Err("Unsupported View Mode action.".to_string()),
    }
    .map_err(|error| error.to_string())
}

pub fn create_public_view(app: &mut App) -> tauri::Result<()> {
    let window = app
        .get_window(LOCAL_SHELL_LABEL)
        .expect("the configured main window must exist");
    let navigation_app = app.handle().clone();
    let popup_app = app.handle().clone();

    let builder = WebviewBuilder::new(
        PUBLIC_VIEW_LABEL,
        WebviewUrl::External(
            PUBLIC_SITE_URL
                .parse()
                .expect("the compile-time public site URL must be valid"),
        ),
    )
    .initialization_script(VIEW_INITIALIZATION_SCRIPT)
    .background_color(tauri::webview::Color(11, 12, 11, 255))
    .browser_extensions_enabled(false)
    .general_autofill_enabled(false)
    .zoom_hotkeys_enabled(false)
    .devtools(cfg!(debug_assertions))
    .on_download(|_, _| false)
    .on_navigation(move |url| {
        if is_trusted_site_url(url) {
            true
        } else {
            open_external(&navigation_app, url);
            false
        }
    })
    .on_new_window(move |url, _| {
        if is_trusted_site_url(&url) {
            if let Some(view) = popup_app.get_webview(PUBLIC_VIEW_LABEL) {
                if let Err(error) = view.navigate(url) {
                    eprintln!("Could not open an internal popup link in View Mode: {error}");
                }
            }
        } else {
            open_external(&popup_app, &url);
        }

        NewWindowResponse::Deny
    });

    let view = window.add_child(
        builder,
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(1.0, 1.0),
    )?;
    view.hide()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_trusted_site_url;

    fn url(value: &str) -> tauri::Url {
        value.parse().expect("test URL should parse")
    }

    #[test]
    fn accepts_only_the_published_project_path() {
        assert!(is_trusted_site_url(&url(
            "https://danielbrindusa.github.io/ArtaGatitului/retete/steak-de-vita/"
        )));
        assert!(is_trusted_site_url(&url(
            "https://danielbrindusa.github.io/ArtaGatitului"
        )));
        assert!(!is_trusted_site_url(&url(
            "https://danielbrindusa.github.io/another-project/"
        )));
    }

    #[test]
    fn rejects_lookalike_and_insecure_origins() {
        assert!(!is_trusted_site_url(&url(
            "http://danielbrindusa.github.io/ArtaGatitului/"
        )));
        assert!(!is_trusted_site_url(&url(
            "https://danielbrindusa.github.io.evil.example/ArtaGatitului/"
        )));
        assert!(!is_trusted_site_url(&url(
            "https://example.com/ArtaGatitului/"
        )));
    }
}

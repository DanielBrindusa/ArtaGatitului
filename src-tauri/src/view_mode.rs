use tauri::{webview::NewWindowResponse, App, AppHandle, Manager, Webview};
use tauri_plugin_opener::OpenerExt;

#[cfg(desktop)]
use serde::Deserialize;
#[cfg(mobile)]
use tauri::webview::WebviewWindowBuilder;
#[cfg(desktop)]
use tauri::{webview::WebviewBuilder, LogicalPosition, LogicalSize, Rect, WebviewUrl};

#[cfg(desktop)]
pub const PUBLIC_SITE_URL: &str = "https://danielbrindusa.github.io/ArtaGatitului/";
const PUBLIC_SITE_HOST: &str = "danielbrindusa.github.io";
const PUBLIC_SITE_PATH: &str = "/ArtaGatitului";
const LOCAL_SHELL_LABEL: &str = "main";
#[cfg(desktop)]
const PUBLIC_VIEW_LABEL: &str = "public-view";

#[cfg(desktop)]
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

#[cfg(mobile)]
#[cfg(debug_assertions)]
const MOBILE_EDITOR_URL: &str = "http://localhost:1420/#edit";
#[cfg(mobile)]
#[cfg(not(debug_assertions))]
const MOBILE_EDITOR_URL: &str = "http://tauri.localhost/#edit";

#[cfg(mobile)]
const MOBILE_INITIALIZATION_SCRIPT: &str = r#"
try {
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: false,
    value: true
  });
} catch (_) {}

(() => {
  const isPublicSite = window.location.protocol === 'https:'
    && window.location.hostname === 'danielbrindusa.github.io'
    && (window.location.pathname === '/ArtaGatitului'
      || window.location.pathname.startsWith('/ArtaGatitului/'));
  if (!isPublicSite) return;

  const applyNativeInsets = () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!document.head || !document.body || !viewport) return false;

    if (!viewport.content.includes('viewport-fit=cover')) {
      viewport.content = `${viewport.content}, viewport-fit=cover`;
    }

    if (!document.getElementById('arta-native-safe-areas')) {
      const style = document.createElement('style');
      style.id = 'arta-native-safe-areas';
      style.textContent = `
        .site-header { padding-top: env(safe-area-inset-top, 0px); }
        .nav-wrap {
          padding-left: calc(var(--space-4) + env(safe-area-inset-left, 0px));
          padding-right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
        }
        .footer { padding-bottom: env(safe-area-inset-bottom, 0px); }
        .install-toast, .offline-badge {
          right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
          bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
        }
        .quick-actions {
          right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
          bottom: calc(var(--space-4) + 74px + env(safe-area-inset-bottom, 0px));
        }
        .theme-panel {
          right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
          top: calc(74px + env(safe-area-inset-top, 0px));
        }
        .floating-randomizer {
          right: calc(var(--space-4) + 64px + env(safe-area-inset-right, 0px));
          top: calc(108px + env(safe-area-inset-top, 0px));
        }
        .scroll-progress { top: env(safe-area-inset-top, 0px); }
        #arta-native-editor-link {
          position: fixed;
          z-index: 2147483000;
          left: calc(12px + env(safe-area-inset-left, 0px));
          bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          display: inline-flex;
          min-height: 42px;
          align-items: center;
          justify-content: center;
          padding: 0 15px;
          border: 1px solid rgba(255, 214, 186, 0.42);
          border-radius: 8px;
          color: #fff3e8;
          background: rgba(16, 16, 15, 0.96);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
          font: 700 13px/1 system-ui, sans-serif;
          letter-spacing: 0;
          text-decoration: none;
        }
      `;
      document.head.appendChild(style);
    }

    if (!document.getElementById('arta-native-editor-link')) {
      const editorLink = document.createElement('a');
      editorLink.id = 'arta-native-editor-link';
      editorLink.href = '__ARTA_EDITOR_URL__';
      editorLink.textContent = 'Editor';
      editorLink.setAttribute('aria-label', 'Open Arta Gătitului Editor');
      document.body.appendChild(editorLink);
    }

    return true;
  };

  if (!applyNativeInsets()) {
    const observer = new MutationObserver(() => {
      if (applyNativeInsets()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }
})();
"#;

#[cfg(mobile)]
fn mobile_initialization_script() -> String {
    MOBILE_INITIALIZATION_SCRIPT.replace("__ARTA_EDITOR_URL__", MOBILE_EDITOR_URL)
}

#[cfg(desktop)]
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

fn is_local_shell_url(url: &tauri::Url) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }

    let production_shell = matches!(
        (url.scheme(), url.host_str(), url.port()),
        ("tauri", Some("localhost"), None) | ("http" | "https", Some("tauri.localhost"), None)
    );
    let development_shell = cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"))
        && url.port() == Some(1420);

    production_shell || development_shell
}

fn open_external(app: &AppHandle, url: &tauri::Url) {
    if !is_safe_external_url(url) {
        eprintln!(
            "Blocked unsupported external navigation scheme: {}",
            url.scheme()
        );
        return;
    }

    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("Could not open external URL in the system browser: {error}");
    }
}

#[cfg(desktop)]
fn public_webview(app: &AppHandle) -> Result<Webview, String> {
    app.get_webview(PUBLIC_VIEW_LABEL)
        .ok_or_else(|| "Public View Mode is not available.".to_string())
}

pub(crate) fn require_local_shell(caller: &Webview) -> Result<(), String> {
    let caller_url = caller
        .url()
        .map_err(|_| "The application shell URL could not be verified.".to_string())?;

    if caller.label() == LOCAL_SHELL_LABEL && is_local_shell_url(&caller_url) {
        Ok(())
    } else {
        Err("This command is restricted to the local application shell.".to_string())
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn set_view_bounds(caller: Webview, app: AppHandle, bounds: ViewBounds) -> Result<(), String> {
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

#[cfg(desktop)]
#[tauri::command]
pub fn set_view_visibility(caller: Webview, app: AppHandle, visible: bool) -> Result<(), String> {
    require_local_shell(&caller)?;
    let view = public_webview(&app)?;

    if visible { view.show() } else { view.hide() }.map_err(|error| error.to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub fn navigate_view(caller: Webview, app: AppHandle, action: String) -> Result<(), String> {
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

#[cfg(desktop)]
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

#[cfg(mobile)]
pub fn create_mobile_view(app: &mut App) -> tauri::Result<()> {
    let window_config = app
        .config()
        .app
        .windows
        .first()
        .expect("the Android main webview configuration must exist");
    let navigation_app = app.handle().clone();
    let popup_app = app.handle().clone();

    WebviewWindowBuilder::from_config(app.handle(), window_config)?
        .initialization_script(mobile_initialization_script())
        .devtools(cfg!(debug_assertions))
        .on_download(|_, _| false)
        .on_navigation(move |url| {
            if is_local_shell_url(url) || is_trusted_site_url(url) {
                true
            } else {
                open_external(&navigation_app, url);
                false
            }
        })
        .on_new_window(move |url, _| {
            if is_trusted_site_url(&url) {
                if let Some(view) = popup_app.get_webview(LOCAL_SHELL_LABEL) {
                    if let Err(error) = view.navigate(url) {
                        eprintln!(
                            "Could not open an internal popup link in Android View Mode: {error}"
                        );
                    }
                }
            } else {
                open_external(&popup_app, &url);
            }

            NewWindowResponse::Deny
        })
        .build()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_local_shell_url, is_trusted_site_url, PUBLIC_SITE_URL};

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

    #[test]
    fn recognizes_only_application_shell_origins() {
        assert!(is_local_shell_url(&url("tauri://localhost/index.html")));
        assert!(is_local_shell_url(&url(
            "http://tauri.localhost/index.html"
        )));
        assert!(!is_local_shell_url(&url(PUBLIC_SITE_URL)));
        assert!(!is_local_shell_url(&url(
            "https://tauri.localhost.evil.example/"
        )));
    }
}

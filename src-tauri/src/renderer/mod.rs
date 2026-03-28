use headless_chrome::{Browser, LaunchOptions};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

/// Headless Chrome renderer for JavaScript-heavy pages.
/// One browser instance is shared across the entire crawl session.
/// Each page gets its own tab (lightweight, auto-closed on drop).
/// Browser is wrapped in Mutex for safe cross-thread access.
pub struct JsRenderer {
    browser: Mutex<Browser>,
    ajax_timeout: Duration,
}

/// Find a Chromium-based browser on the system.
/// Checks all popular Chromium browsers in order of popularity.
fn find_chromium_browser() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let pf = std::env::var("PROGRAMFILES").unwrap_or_default();
        let pf86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_default();
        vec![
            // Google Chrome
            PathBuf::from(&local).join("Google/Chrome/Application/chrome.exe"),
            PathBuf::from(&pf).join("Google/Chrome/Application/chrome.exe"),
            PathBuf::from(&pf86).join("Google/Chrome/Application/chrome.exe"),
            // Microsoft Edge
            PathBuf::from(&pf86).join("Microsoft/Edge/Application/msedge.exe"),
            PathBuf::from(&pf).join("Microsoft/Edge/Application/msedge.exe"),
            PathBuf::from(&local).join("Microsoft/Edge/Application/msedge.exe"),
            // Brave
            PathBuf::from(&local).join("BraveSoftware/Brave-Browser/Application/brave.exe"),
            PathBuf::from(&pf).join("BraveSoftware/Brave-Browser/Application/brave.exe"),
            PathBuf::from(&pf86).join("BraveSoftware/Brave-Browser/Application/brave.exe"),
            // Opera
            PathBuf::from(&local).join("Programs/Opera/opera.exe"),
            PathBuf::from(&pf).join("Opera/opera.exe"),
            PathBuf::from(&pf86).join("Opera/opera.exe"),
            // Opera GX
            PathBuf::from(&local).join("Programs/Opera GX/opera.exe"),
            // Vivaldi
            PathBuf::from(&local).join("Vivaldi/Application/vivaldi.exe"),
            PathBuf::from(&pf).join("Vivaldi/Application/vivaldi.exe"),
            // Arc
            PathBuf::from(&local).join("Arc/Application/arc.exe"),
            // Chromium
            PathBuf::from(&local).join("Chromium/Application/chrome.exe"),
            PathBuf::from(&pf).join("Chromium/Application/chrome.exe"),
            // Yandex Browser
            PathBuf::from(&local).join("Yandex/YandexBrowser/Application/browser.exe"),
            // Samsung Internet (desktop)
            PathBuf::from(&local).join("Samsung/Samsung Internet/Application/browser.exe"),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            // Google Chrome
            PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            // Microsoft Edge
            PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
            // Brave
            PathBuf::from("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
            // Opera
            PathBuf::from("/Applications/Opera.app/Contents/MacOS/Opera"),
            // Opera GX
            PathBuf::from("/Applications/Opera GX.app/Contents/MacOS/Opera"),
            // Vivaldi
            PathBuf::from("/Applications/Vivaldi.app/Contents/MacOS/Vivaldi"),
            // Arc
            PathBuf::from("/Applications/Arc.app/Contents/MacOS/Arc"),
            // Chromium
            PathBuf::from("/Applications/Chromium.app/Contents/MacOS/Chromium"),
            // Yandex Browser
            PathBuf::from("/Applications/Yandex.app/Contents/MacOS/Yandex"),
            // Orion
            PathBuf::from("/Applications/Orion.app/Contents/MacOS/Orion"),
        ]
    } else {
        // Linux — check common binary names
        vec![
            // Google Chrome
            PathBuf::from("/usr/bin/google-chrome"),
            PathBuf::from("/usr/bin/google-chrome-stable"),
            // Microsoft Edge
            PathBuf::from("/usr/bin/microsoft-edge"),
            PathBuf::from("/usr/bin/microsoft-edge-stable"),
            // Brave
            PathBuf::from("/usr/bin/brave-browser"),
            PathBuf::from("/usr/bin/brave-browser-stable"),
            // Opera
            PathBuf::from("/usr/bin/opera"),
            // Vivaldi
            PathBuf::from("/usr/bin/vivaldi"),
            PathBuf::from("/usr/bin/vivaldi-stable"),
            // Chromium
            PathBuf::from("/usr/bin/chromium"),
            PathBuf::from("/usr/bin/chromium-browser"),
            // Yandex
            PathBuf::from("/usr/bin/yandex-browser"),
            PathBuf::from("/usr/bin/yandex-browser-stable"),
            // Snap / Flatpak common paths
            PathBuf::from("/snap/bin/chromium"),
            PathBuf::from("/var/lib/flatpak/exports/bin/com.google.Chrome"),
            PathBuf::from("/var/lib/flatpak/exports/bin/com.brave.Browser"),
            PathBuf::from("/var/lib/flatpak/exports/bin/com.microsoft.Edge"),
        ]
    };

    candidates.into_iter().find(|p| p.exists())
}

impl JsRenderer {
    pub fn new(
        ajax_timeout_seconds: u32,
        viewport_width: u32,
        viewport_height: u32,
        user_agent: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let browser_path = find_chromium_browser();

        // Use new headless mode (--headless=new) which shares the full browser
        // codebase and is virtually undetectable, unlike the old --headless mode.
        // We set headless: false to prevent the crate from adding --headless,
        // then pass --headless=new ourselves.
        let ua_arg = format!("--user-agent={}", user_agent);
        let stealth_args: Vec<&std::ffi::OsStr> = vec![
            "--headless=new".as_ref(),
            "--disable-blink-features=AutomationControlled".as_ref(),
            "--disable-features=IsolateOrigins,site-per-process".as_ref(),
            "--disable-infobars".as_ref(),
            "--no-first-run".as_ref(),
            "--no-default-browser-check".as_ref(),
            "--disable-extensions".as_ref(),
            "--disable-component-extensions-with-background-pages".as_ref(),
            "--disable-default-apps".as_ref(),
            "--disable-popup-blocking".as_ref(),
            "--disable-hang-monitor".as_ref(),
            "--disable-prompt-on-repost".as_ref(),
            "--disable-sync".as_ref(),
            "--disable-translate".as_ref(),
            "--metrics-recording-only".as_ref(),
            "--safebrowsing-disable-auto-update".as_ref(),
            "--password-store=basic".as_ref(),
            "--use-mock-keychain".as_ref(),
            ua_arg.as_ref(),
        ];

        let launch_options = LaunchOptions {
            headless: false,
            path: browser_path,
            window_size: Some((viewport_width, viewport_height)),
            args: stealth_args,
            ..LaunchOptions::default()
        };

        let browser = Browser::new(launch_options).map_err(|e| {
            format!(
                "Failed to launch browser: {}. Install Chrome, Edge, Brave, Opera, or Vivaldi.",
                e
            )
        })?;

        Ok(Self {
            browser: Mutex::new(browser),
            ajax_timeout: Duration::from_secs(ajax_timeout_seconds as u64),
        })
    }

    /// Navigate to a URL, wait for JS to execute, and return the rendered DOM HTML.
    pub fn render_page(
        &self,
        url: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // Lock only briefly to create a new tab — tabs are independent and thread-safe
        let tab = {
            let browser = self.browser.lock().unwrap_or_else(|e| e.into_inner());
            browser
                .new_tab()
                .map_err(|e| format!("Failed to open browser tab: {}", e))?
        }; // mutex released here — other threads can create tabs concurrently

        // Enable stealth mode: bypasses webdriver, chrome, permissions, plugins, WebGL detection
        let _ = tab.enable_stealth_mode();

        tab.navigate_to(url)
            .map_err(|e| format!("Navigation failed for {}: {}", url, e))?;

        tab.wait_until_navigated()
            .map_err(|e| format!("Wait failed for {}: {}", url, e))?;

        // Wait for content to load — try waiting for body element first, fall back to sleep
        if tab
            .wait_for_element_with_custom_timeout("body", self.ajax_timeout)
            .is_err()
        {
            // If body wait fails, sleep for the full timeout as fallback
            std::thread::sleep(self.ajax_timeout);
        }

        // Extract the fully rendered DOM
        let rendered_html = tab
            .get_content()
            .map_err(|e| format!("Failed to get rendered HTML for {}: {}", url, e))?;

        Ok(rendered_html)
    }
}

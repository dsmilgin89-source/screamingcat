mod crawler;
mod integrations;
mod parser;
mod renderer;
mod storage;

use crawler::engine::CrawlEngine;
use integrations::{
    analytics::GaPageData,
    google_auth::GoogleTokens,
    pagespeed::PageSpeedResult,
    search_console::{GscPageData, GscQueryData},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct AppState {
    engine: Arc<Mutex<CrawlEngine>>,
}

// ── Spider: Resource crawling ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResourceCrawlOptions {
    pub check_images: bool,
    pub check_css: bool,
    pub check_javascript: bool,
    pub check_media: bool,
}

// ── Spider: Page link options ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PageLinkOptions {
    pub internal_links: bool,
    pub external_links: bool,
    pub canonicals: bool,
    pub pagination: bool,
    pub hreflang: bool,
    pub meta_refresh: bool,
    pub follow_internal_nofollow: bool,
    pub follow_external_nofollow: bool,
    pub crawl_linked_sitemaps: bool,
    pub crawl_outside_start_folder: bool,
    pub crawl_all_subdomains: bool,
}

// ── Limits ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CrawlLimits {
    pub max_urls: u32,
    pub max_depth: u32,
    pub max_folder_depth: u32,
    pub max_query_strings: u32,
    pub max_redirects: u32,
    pub max_url_length: u32,
    pub max_page_size_kb: u32,
    pub max_links_per_url: u32,
}

// ── Speed ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeedConfig {
    pub max_threads: u32,
    pub max_urls_per_second: u32,
    pub delay_ms: u64,
}

// ── User-Agent ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserAgentConfig {
    pub preset: String,
    pub custom_ua: String,
}

// ── Robots ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RobotsConfig {
    pub mode: String,
    pub show_blocked_internal: bool,
    pub show_blocked_external: bool,
}

// ── Include/Exclude ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UrlFilterConfig {
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
}

// ── Extraction ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractionConfig {
    pub page_titles: bool,
    pub meta_descriptions: bool,
    pub meta_keywords: bool,
    pub h1: bool,
    pub h2: bool,
    pub canonicals: bool,
    pub meta_robots: bool,
    pub open_graph: bool,
    pub twitter_cards: bool,
    pub structured_data: bool,
    pub word_count: bool,
    pub response_time: bool,
    pub indexability: bool,
}

// ── Advanced ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdvancedConfig {
    pub response_timeout_seconds: u32,
    pub retry_5xx: u32,
    pub respect_noindex: bool,
    pub respect_canonical: bool,
    pub always_follow_redirects: bool,
    pub crawl_fragment_identifiers: bool,
    pub store_html: bool,
    pub title_max_length: u32,
    pub title_min_length: u32,
    pub description_max_length: u32,
    pub description_min_length: u32,
    pub h1_max_length: u32,
    pub max_image_size_kb: u32,
    pub low_content_word_count: u32,
}

// ── Rendering ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenderingConfig {
    pub rendering_mode: String,         // "text_only" | "javascript"
    pub ajax_timeout_seconds: u32,
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub store_rendered_html: bool,
}

// ── Custom Search ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomSearchRule {
    pub name: String,
    pub pattern: String,
    pub mode: String,      // "contains" | "regex"
    pub search_in: String, // "html" | "text"
    #[serde(default)]
    pub case_sensitive: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomSearchConfig {
    pub rules: Vec<CustomSearchRule>,
}

// ── Custom HTTP Headers ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomHeader {
    pub name: String,
    pub value: String,
    pub enabled: bool,
}

// ── Custom Extraction ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomExtractionRule {
    pub name: String,
    pub selector: String,
    pub mode: String,      // "css_selector" | "xpath" | "regex"
    pub target: String,    // "inner_html" | "text" | "attribute"
    pub attribute: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomExtractionConfig {
    pub rules: Vec<CustomExtractionRule>,
}

// ── Auth ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthConfig {
    pub enabled: bool,
    pub login_url: String,
    pub username_field: String,
    pub password_field: String,
    pub username: String,
    pub password: String,
    pub extra_fields: Vec<(String, String)>,
}

// ── Full config ──
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CrawlConfig {
    pub url: String,
    pub resources: ResourceCrawlOptions,
    pub page_links: PageLinkOptions,
    pub limits: CrawlLimits,
    pub speed: SpeedConfig,
    pub user_agent: UserAgentConfig,
    pub robots: RobotsConfig,
    pub url_filters: UrlFilterConfig,
    pub extraction: ExtractionConfig,
    pub advanced: AdvancedConfig,
    pub rendering: RenderingConfig,
    pub custom_search: CustomSearchConfig,
    pub custom_extraction: CustomExtractionConfig,
    pub custom_headers: Vec<CustomHeader>,
    pub auth: AuthConfig,
}

impl CrawlConfig {
    /// Resolve the effective user-agent string from preset or custom
    pub fn effective_user_agent(&self) -> String {
        match self.user_agent.preset.as_str() {
            "custom" => self.user_agent.custom_ua.clone(),
            "googlebot_desktop" => "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)".to_string(),
            "googlebot_mobile" => "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)".to_string(),
            "bingbot" => "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)".to_string(),
            "chrome_desktop" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36".to_string(),
            "firefox_desktop" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0".to_string(),
            _ => "ScreamingCAT/0.1 (+https://github.com/screamingcat)".to_string(),
        }
    }
}

impl Default for CrawlConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            resources: ResourceCrawlOptions {
                check_images: true,
                check_css: true,
                check_javascript: true,
                check_media: false,
            },
            page_links: PageLinkOptions {
                internal_links: true,
                external_links: false,
                canonicals: true,
                pagination: true,
                hreflang: true,
                meta_refresh: true,
                follow_internal_nofollow: true,
                follow_external_nofollow: false,
                crawl_linked_sitemaps: true,
                crawl_outside_start_folder: false,
                crawl_all_subdomains: false,
            },
            limits: CrawlLimits {
                max_urls: 0,
                max_depth: 10,
                max_folder_depth: 0,
                max_query_strings: 0,
                max_redirects: 10,
                max_url_length: 2048,
                max_page_size_kb: 0,
                max_links_per_url: 0,
            },
            speed: SpeedConfig {
                max_threads: 8,
                max_urls_per_second: 0,
                delay_ms: 100,
            },
            user_agent: UserAgentConfig {
                preset: "screamingcat".to_string(),
                custom_ua: String::new(),
            },
            robots: RobotsConfig {
                mode: "respect".to_string(),
                show_blocked_internal: true,
                show_blocked_external: false,
            },
            url_filters: UrlFilterConfig {
                include_patterns: vec![],
                exclude_patterns: vec![],
            },
            extraction: ExtractionConfig {
                page_titles: true,
                meta_descriptions: true,
                meta_keywords: true,
                h1: true,
                h2: true,
                canonicals: true,
                meta_robots: true,
                open_graph: true,
                twitter_cards: true,
                structured_data: true,
                word_count: true,
                response_time: true,
                indexability: true,
            },
            advanced: AdvancedConfig {
                response_timeout_seconds: 30,
                retry_5xx: 0,
                respect_noindex: true,
                respect_canonical: true,
                always_follow_redirects: true,
                crawl_fragment_identifiers: false,
                store_html: false,
                title_max_length: 60,
                title_min_length: 10,
                description_max_length: 160,
                description_min_length: 50,
                h1_max_length: 70,
                max_image_size_kb: 200,
                low_content_word_count: 200,
            },
            rendering: RenderingConfig {
                rendering_mode: "text_only".to_string(),
                ajax_timeout_seconds: 5,
                viewport_width: 1280,
                viewport_height: 800,
                store_rendered_html: false,
            },
            custom_search: CustomSearchConfig { rules: vec![] },
            custom_extraction: CustomExtractionConfig { rules: vec![] },
            custom_headers: vec![],
            auth: AuthConfig {
                enabled: false,
                login_url: String::new(),
                username_field: "username".to_string(),
                password_field: "password".to_string(),
                username: String::new(),
                password: String::new(),
                extra_fields: vec![],
            },
        }
    }
}

// ══════════════════════════════════════════════════════
// ── Crawl commands ──
// ══════════════════════════════════════════════════════

#[tauri::command]
async fn start_crawl(
    config: CrawlConfig,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let engine = state.engine.clone();
    let mut engine = engine.lock().await;
    engine
        .start(config, app)
        .await
        .map_err(|e| e.to_string())?;
    Ok("Crawl started".to_string())
}

#[tauri::command]
async fn start_crawl_list(
    urls: Vec<String>,
    config: CrawlConfig,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let engine = state.engine.clone();
    let mut engine = engine.lock().await;
    engine
        .start_list(urls, config, app)
        .await
        .map_err(|e| e.to_string())?;
    Ok("List crawl started".to_string())
}

#[tauri::command]
async fn stop_crawl(state: State<'_, AppState>) -> Result<String, String> {
    let engine = state.engine.clone();
    let mut engine = engine.lock().await;
    engine.stop().await;
    Ok("Crawl stopped".to_string())
}

#[tauri::command]
async fn get_crawl_stats(state: State<'_, AppState>) -> Result<crawler::CrawlStats, String> {
    let engine = state.engine.clone();
    let engine = engine.lock().await;
    Ok(engine.stats())
}

#[tauri::command]
async fn get_results(
    page: u32,
    page_size: u32,
    state: State<'_, AppState>,
) -> Result<Vec<crawler::CrawlResult>, String> {
    let engine = state.engine.clone();
    let engine = engine.lock().await;
    engine
        .get_results(page, page_size)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_csv(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let engine = state.engine.clone();
    let engine = engine.lock().await;
    engine.export_csv(&path).await.map_err(|e| e.to_string())?;
    Ok(format!("Exported to {}", path))
}

// ══════════════════════════════════════════════════════
// ── Snapshot commands ──
// ══════════════════════════════════════════════════════

#[tauri::command]
async fn save_crawl_snapshot(name: String, storage_config: Option<storage::snapshots::StorageConfig>, state: State<'_, AppState>) -> Result<storage::snapshots::SnapshotMeta, String> {
    let engine = state.engine.clone();
    let engine = engine.lock().await;
    let results = engine.get_results(0, 100000).await.map_err(|e| e.to_string())?;

    let domain = if let Some(first) = results.first() {
        url::Url::parse(&first.url).ok()
            .and_then(|u| u.domain().map(|d| d.to_string()))
            .unwrap_or_default()
    } else {
        String::new()
    };

    // Calculate extended stats
    let mut status_2xx = 0u32;
    let mut status_3xx = 0u32;
    let mut status_4xx = 0u32;
    let mut status_5xx = 0u32;
    let mut total_response_ms = 0u64;
    let mut indexable_count = 0u32;
    let mut non_indexable_count = 0u32;
    let mut total_word_count = 0u64;

    for r in &results {
        match r.status_code {
            200..=299 => status_2xx += 1,
            300..=399 => status_3xx += 1,
            400..=499 => status_4xx += 1,
            500..=599 => status_5xx += 1,
            _ => {}
        }
        total_response_ms += r.response_time_ms;
        if r.indexable { indexable_count += 1; } else { non_indexable_count += 1; }
        total_word_count += r.word_count as u64;
    }

    let avg_response_ms = if results.is_empty() { 0 } else { total_response_ms / results.len() as u64 };

    let meta = storage::snapshots::SnapshotMeta {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        domain,
        url_count: results.len() as u32,
        created_at: chrono::Utc::now().to_rfc3339(),
        status_2xx,
        status_3xx,
        status_4xx,
        status_5xx,
        avg_response_ms,
        indexable_count,
        non_indexable_count,
        total_word_count,
        size_bytes: 0, // will be updated during save
    };

    let rows: Vec<storage::snapshots::SnapshotRow> = results.iter().map(|r| {
        storage::snapshots::SnapshotRow {
            url: r.url.clone(),
            status_code: r.status_code,
            title: r.title.clone(),
            meta_description: r.meta_description.clone(),
            h1: r.h1.clone(),
            word_count: r.word_count,
            canonical: r.canonical.clone(),
            indexable: r.indexable,
            content_hash: r.content_hash.clone(),
        }
    }).collect();

    let cfg = storage_config.unwrap_or_default();
    storage::snapshots::save_snapshot_with_config(&meta, &rows, &cfg).map_err(|e| e.to_string())?;
    Ok(meta)
}

#[tauri::command]
async fn list_crawl_snapshots(storage_config: Option<storage::snapshots::StorageConfig>) -> Result<Vec<storage::snapshots::SnapshotMeta>, String> {
    let cfg = storage_config.unwrap_or_default();
    Ok(storage::snapshots::list_snapshots_with_config(&cfg))
}

#[tauri::command]
async fn delete_crawl_snapshot(id: String, storage_config: Option<storage::snapshots::StorageConfig>) -> Result<String, String> {
    let cfg = storage_config.unwrap_or_default();
    storage::snapshots::delete_snapshot_with_config(&id, &cfg).map_err(|e| e.to_string())?;
    Ok("Deleted".to_string())
}

#[tauri::command]
async fn compare_crawl_snapshots(id_a: String, id_b: String, storage_config: Option<storage::snapshots::StorageConfig>) -> Result<storage::snapshots::CrawlComparison, String> {
    let cfg = storage_config.unwrap_or_default();
    storage::snapshots::compare_snapshots_with_config(&id_a, &id_b, &cfg).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_storage_stats(storage_config: Option<storage::snapshots::StorageConfig>) -> Result<storage::snapshots::StorageStats, String> {
    let cfg = storage_config.unwrap_or_default();
    Ok(storage::snapshots::get_storage_stats(&cfg))
}

#[tauri::command]
async fn cleanup_snapshots(storage_config: Option<storage::snapshots::StorageConfig>) -> Result<u32, String> {
    let cfg = storage_config.unwrap_or_default();
    Ok(storage::snapshots::cleanup_snapshots(&cfg))
}

// ══════════════════════════════════════════════════════
// ── File I/O commands ──
// ══════════════════════════════════════════════════════

/// Validate that a file path is safe for I/O (no system dirs, no traversal)
fn validate_file_path(path: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::PathBuf::from(path);
    let canonical = p.parent()
        .and_then(|parent| std::fs::canonicalize(parent).ok())
        .map(|parent| parent.join(p.file_name().unwrap_or_default()))
        .unwrap_or_else(|| p.clone());

    // Block system-critical directories
    let path_str = canonical.to_string_lossy().to_lowercase();
    let blocked = ["\\windows\\", "\\system32", "/etc/", "/usr/", "/bin/", "/sbin/"];
    for b in &blocked {
        if path_str.contains(b) {
            return Err(format!("Access denied: cannot write to system directory"));
        }
    }
    Ok(canonical)
}

#[tauri::command]
async fn write_file(path: String, contents: String) -> Result<String, String> {
    let safe_path = validate_file_path(&path)?;
    std::fs::write(&safe_path, contents).map_err(|e| e.to_string())?;
    Ok(format!("Written to {}", safe_path.display()))
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    let safe_path = validate_file_path(&path)?;
    std::fs::read_to_string(&safe_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_file_binary(path: String, data: String) -> Result<String, String> {
    let safe_path = validate_file_path(&path)?;
    let bytes = base64_decode(&data).map_err(|e| e.to_string())?;
    std::fs::write(&safe_path, bytes).map_err(|e| e.to_string())?;
    Ok(format!("Written to {}", safe_path.display()))
}

// ══════════════════════════════════════════════════════
// ── Integration commands ──
// ══════════════════════════════════════════════════════

/// Run PageSpeed Insights for a single URL
#[tauri::command]
async fn run_pagespeed(
    url: String,
    api_key: String,
    strategy: String,
) -> Result<PageSpeedResult, String> {
    Ok(integrations::pagespeed::analyze_url(&url, &api_key, &strategy).await)
}

/// Run PageSpeed Insights for multiple URLs with progress events
#[tauri::command]
async fn run_pagespeed_batch(
    urls: Vec<String>,
    api_key: String,
    strategy: String,
    app: tauri::AppHandle,
) -> Result<Vec<PageSpeedResult>, String> {
    use tauri::Emitter;

    let mut results = Vec::new();
    let total = urls.len();

    for (i, url) in urls.iter().enumerate() {
        let result =
            integrations::pagespeed::analyze_url(url, &api_key, &strategy).await;
        results.push(result.clone());

        // Emit progress event
        let _ = app.emit(
            "pagespeed-progress",
            serde_json::json!({
                "completed": i + 1,
                "total": total,
                "result": result,
            }),
        );

        // Small delay to respect API rate limits
        if i + 1 < total {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }

    Ok(results)
}

/// Start Google OAuth2 flow — opens browser, returns tokens
#[tauri::command]
async fn google_oauth_connect(
    client_id: String,
    client_secret: String,
    scopes: String,
) -> Result<GoogleTokens, String> {
    let (code, port) =
        integrations::google_auth::start_oauth_flow(&client_id, &scopes).await?;
    let tokens =
        integrations::google_auth::exchange_code(&client_id, &client_secret, &code, port)
            .await?;
    Ok(tokens)
}

/// Refresh an expired Google access token
#[tauri::command]
async fn google_oauth_refresh(
    client_id: String,
    client_secret: String,
    refresh_token: String,
) -> Result<GoogleTokens, String> {
    integrations::google_auth::refresh_token(&client_id, &client_secret, &refresh_token).await
}

/// Fetch Google Search Console page data
#[tauri::command]
async fn fetch_gsc_pages(
    site_url: String,
    access_token: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<GscPageData>, String> {
    integrations::search_console::fetch_page_data(
        &site_url,
        &access_token,
        &start_date,
        &end_date,
    )
    .await
}

/// Fetch Google Search Console query data
#[tauri::command]
async fn fetch_gsc_queries(
    site_url: String,
    access_token: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<GscQueryData>, String> {
    integrations::search_console::fetch_query_data(
        &site_url,
        &access_token,
        &start_date,
        &end_date,
    )
    .await
}

/// Fetch Google Analytics 4 page data
#[tauri::command]
async fn fetch_ga_pages(
    property_id: String,
    access_token: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<GaPageData>, String> {
    integrations::analytics::fetch_page_data(
        &property_id,
        &access_token,
        &start_date,
        &end_date,
    )
    .await
}

#[tauri::command]
fn detect_system_info() -> serde_json::Value {
    let cores = num_cpus::get() as u32;
    let suggested_threads = (cores * 2).min(32);
    serde_json::json!({
        "cpu_cores": cores,
        "suggested_threads": suggested_threads
    })
}

// ══════════════════════════════════════════════════════
// ── Helpers ──
// ══════════════════════════════════════════════════════

/// Simple base64 decoder (avoids adding base64 crate dependency)
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = input.trim_end_matches('=');
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &byte in input.as_bytes() {
        let val = TABLE.iter().position(|&b| b == byte)
            .ok_or_else(|| format!("Invalid base64 character: {}", byte as char))? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(output)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Log panics to a file for diagnostics (especially in release builds without console)
    std::panic::set_hook(Box::new(|info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let msg = format!("PANIC: {}\nBacktrace:\n{}", info, bt);
        let log_path = std::env::temp_dir().join("screamingcat_crash.log");
        let _ = std::fs::write(&log_path, &msg);
        eprintln!("{}", msg);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            engine: Arc::new(Mutex::new(CrawlEngine::new())),
        })
        .invoke_handler(tauri::generate_handler![
            start_crawl,
            start_crawl_list,
            stop_crawl,
            get_crawl_stats,
            get_results,
            export_csv,
            write_file,
            read_file,
            write_file_binary,
            // Integrations
            run_pagespeed,
            run_pagespeed_batch,
            google_oauth_connect,
            google_oauth_refresh,
            fetch_gsc_pages,
            fetch_gsc_queries,
            fetch_ga_pages,
            // System
            detect_system_info,
            // Snapshots & History
            save_crawl_snapshot,
            list_crawl_snapshots,
            delete_crawl_snapshot,
            compare_crawl_snapshots,
            get_storage_stats,
            cleanup_snapshots,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

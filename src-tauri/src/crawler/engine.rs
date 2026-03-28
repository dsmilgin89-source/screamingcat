use crate::crawler::robots::RobotsChecker;
use crate::crawler::sitemap_parser;
use crate::crawler::{CrawlResult, CrawlStats, RedirectHop};
use crate::parser::html::HtmlParser;
use crate::renderer::JsRenderer;
use crate::storage::db::Database;
use crate::{CrawlConfig, RenderingMode, RobotsMode};
use reqwest::Client;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::sync::{mpsc, Semaphore};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};
use url::Url;

/// Curated response headers worth capturing for SEO analysis
const CAPTURED_HEADERS: &[&str] = &[
    "cache-control",
    "x-robots-tag",
    "content-encoding",
    "content-security-policy",
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "server",
    "vary",
    "link",
    "content-language",
    "x-powered-by",
    "age",
    "expires",
    "pragma",
];

/// Create an empty/error CrawlResult with just basic fields set
fn empty_result(
    url: &str,
    status_code: u16,
    content_type: String,
    response_time_ms: u64,
    content_length: u64,
    depth: u32,
    redirect_url: String,
) -> CrawlResult {
    CrawlResult {
        url: url.to_string(),
        status_code,
        content_type,
        response_time_ms,
        content_length,
        title: String::new(),
        meta_description: String::new(),
        h1: String::new(),
        h2_count: 0,
        canonical: String::new(),
        robots_meta: String::new(),
        word_count: 0,
        internal_links: 0,
        external_links: 0,
        depth,
        redirect_url,
        indexable: false,
        custom_search_results: vec![],
        custom_extraction_results: vec![],
        images: vec![],
        images_count: 0,
        images_missing_alt: 0,
        hreflang: vec![],
        structured_data_types: vec![],
        structured_data: vec![],
        og_title: String::new(),
        og_description: String::new(),
        og_image: String::new(),
        twitter_card: String::new(),
        twitter_title: String::new(),
        meta_keywords: String::new(),
        h2s: vec![],
        css_count: 0,
        js_count: 0,
        inline_css_count: 0,
        inline_js_count: 0,
        total_resource_size: 0,
        dom_depth: 0,
        text_ratio: 0.0,
        has_viewport_meta: false,
        has_charset: false,
        has_doctype: false,
        // Phase 1
        redirect_chain: vec![],
        content_hash: String::new(),
        response_headers: vec![],
        meta_refresh: String::new(),
        rel_next: String::new(),
        rel_prev: String::new(),
        // Phase 2
        robots_blocked: false,
        in_sitemap: false,
        // Phase 3
        outlinks: vec![],
        // Phase 4
        has_hsts: false,
        has_csp: false,
        has_x_frame_options: false,
        has_x_content_type_options: false,
        mixed_content_count: 0,
        insecure_form_count: 0,
        title_count: 0,
        h1_count: 0,
        h1_all: vec![],
        meta_description_count: 0,
        lang_attribute: String::new(),
        raw_html: String::new(),
        rendered_html: String::new(),
    }
}

pub struct CrawlEngine {
    db: Option<Database>,
    stats: CrawlStats,
    cancel_token: Option<tokio::sync::watch::Sender<bool>>,
    start_time: Option<Instant>,
}

impl CrawlEngine {
    pub fn new() -> Self {
        Self {
            db: None,
            stats: CrawlStats::default(),
            cancel_token: None,
            start_time: None,
        }
    }

    pub async fn start(
        &mut self,
        config: CrawlConfig,
        app: tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.start_internal(config, vec![], app).await
    }

    pub async fn start_list(
        &mut self,
        urls: Vec<String>,
        mut config: CrawlConfig,
        app: tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if urls.is_empty() {
            return Err("No URLs provided".into());
        }
        config.url = urls[0].clone();
        self.start_internal(config, urls, app).await
    }

    async fn start_internal(
        &mut self,
        config: CrawlConfig,
        seed_urls: Vec<String>,
        app: tauri::AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let base_url = Url::parse(&config.url)?;
        let base_host = base_url
            .domain()
            .unwrap_or_default()
            .trim_start_matches("www.")
            .to_string();
        let base_domain = extract_root_domain(&base_host);

        let db = Database::new(&base_domain)?;
        self.db = Some(db);
        self.stats = CrawlStats::default();
        self.stats.is_running = true;
        self.start_time = Some(Instant::now());

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        self.cancel_token = Some(cancel_tx);

        let db_for_task = Database::new(&base_domain)?;

        let base_host_clone = base_host.clone();
        info!(domain = %base_domain, host = %base_host_clone, "spawning crawl_loop");
        tokio::spawn(async move {
            if let Err(e) = crawl_loop(
                config,
                base_domain,
                base_host_clone,
                db_for_task,
                cancel_rx,
                app,
                seed_urls,
            )
            .await
            {
                error!(error = %e, "crawl_loop failed");
            }
        });

        Ok(())
    }

    pub async fn stop(&mut self) {
        if let Some(cancel) = self.cancel_token.take() {
            let _ = cancel.send(true);
        }
        self.stats.is_running = false;
    }

    pub fn stats(&self) -> CrawlStats {
        let mut stats = self.stats.clone();
        if let Some(start) = self.start_time {
            stats.elapsed_seconds = start.elapsed().as_secs();
        }
        stats
    }

    pub async fn get_results(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<Vec<CrawlResult>, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref db) = self.db {
            db.get_results(page, page_size)
        } else {
            Ok(vec![])
        }
    }

    pub async fn export_csv(
        &self,
        path: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref db) = self.db {
            db.export_csv(path)
        } else {
            Err("No crawl data available".into())
        }
    }
}

use super::extract_root_domain;

fn is_same_site(url_domain: &str, root_domain: &str) -> bool {
    let url_root = extract_root_domain(url_domain);
    url_root == root_domain
}

fn passes_url_filters(
    url: &str,
    include_regexes: &[regex::Regex],
    exclude_regexes: &[regex::Regex],
) -> bool {
    if !include_regexes.is_empty() && !include_regexes.iter().any(|re| re.is_match(url)) {
        return false;
    }
    if !exclude_regexes.is_empty() && exclude_regexes.iter().any(|re| re.is_match(url)) {
        return false;
    }
    true
}

fn passes_url_limits(url: &str, config: &CrawlConfig) -> bool {
    if config.limits.max_url_length > 0 && url.len() > config.limits.max_url_length as usize {
        return false;
    }

    if let Ok(parsed) = Url::parse(url) {
        if config.limits.max_folder_depth > 0 {
            let segments: Vec<&str> = parsed
                .path_segments()
                .map(|s| s.filter(|seg| !seg.is_empty()).collect())
                .unwrap_or_default();
            if segments.len() > config.limits.max_folder_depth as usize {
                return false;
            }
        }

        if config.limits.max_query_strings > 0 {
            let param_count = parsed.query_pairs().count();
            if param_count > config.limits.max_query_strings as usize {
                return false;
            }
        }
    }

    true
}

/// Capture curated response headers from an HTTP response
fn capture_response_headers(headers: &reqwest::header::HeaderMap) -> Vec<(String, String)> {
    let mut captured = Vec::new();
    for &name in CAPTURED_HEADERS {
        if let Some(value) = headers.get(name) {
            if let Ok(v) = value.to_str() {
                captured.push((name.to_string(), v.to_string()));
            }
        }
    }
    // Also capture Set-Cookie count (not the value for privacy)
    let cookie_count = headers.get_all("set-cookie").iter().count();
    if cookie_count > 0 {
        captured.push(("set-cookie-count".to_string(), cookie_count.to_string()));
    }
    captured
}

async fn crawl_loop(
    config: CrawlConfig,
    base_domain: String,
    base_host: String,
    _db: Database,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
    app: tauri::AppHandle,
    seed_urls: Vec<String>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    info!(url = %config.url, "crawl_loop started");
    let effective_ua = config.effective_user_agent();
    let timeout_secs = config.advanced.response_timeout_seconds as u64;

    // Build custom headers from config
    let mut custom_headers = reqwest::header::HeaderMap::new();
    for h in &config.custom_headers {
        if h.enabled {
            if let Ok(name) = reqwest::header::HeaderName::from_bytes(h.name.as_bytes()) {
                if let Ok(val) = reqwest::header::HeaderValue::from_str(&h.value) {
                    custom_headers.insert(name, val);
                }
            }
        }
    }

    // Always use Policy::none() — we manually follow redirects to track the chain
    let client = Client::builder()
        .user_agent(&effective_ua)
        .timeout(Duration::from_secs(timeout_secs))
        .redirect(reqwest::redirect::Policy::none())
        .default_headers(custom_headers)
        .cookie_store(true)
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .build()?;

    // Forms-based authentication: login before crawling
    if config.auth.enabled && !config.auth.login_url.is_empty() {
        let mut form_data: Vec<(String, String)> = vec![
            (
                config.auth.username_field.clone(),
                config.auth.username.clone(),
            ),
            (
                config.auth.password_field.clone(),
                config.auth.password.clone(),
            ),
        ];
        for (k, v) in &config.auth.extra_fields {
            form_data.push((k.clone(), v.clone()));
        }
        match client
            .post(&config.auth.login_url)
            .form(&form_data)
            .send()
            .await
        {
            Ok(r) => info!(status = %r.status(), "auth login completed"),
            Err(e) => warn!(error = %e, "auth login failed"),
        }
    }

    let max_concurrent = if config.speed.max_threads == 0 {
        (num_cpus::get() * 2).min(32)
    } else {
        std::cmp::max(1, config.speed.max_threads as usize)
    };
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let (result_tx, mut result_rx) = mpsc::channel::<CrawlResult>(256);

    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: Vec<(String, u32)> = Vec::new();

    // Seed queue with provided URLs or fall back to config.url
    if seed_urls.is_empty() {
        queue.push((config.url.clone(), 0));
        visited.insert(config.url.clone());
    } else {
        for url in &seed_urls {
            if visited.insert(url.clone()) {
                queue.push((url.clone(), 0));
            }
        }
    }
    info!(count = queue.len(), "queue seeded");

    // Pre-compile URL filter regexes (avoids recompilation per URL)
    let include_regexes: Vec<regex::Regex> = config
        .url_filters
        .include_patterns
        .iter()
        .filter_map(|pat| regex::Regex::new(pat).ok())
        .collect();
    let exclude_regexes: Vec<regex::Regex> = config
        .url_filters
        .exclude_patterns
        .iter()
        .filter_map(|pat| regex::Regex::new(pat).ok())
        .collect();

    let mut stats = CrawlStats {
        is_running: true,
        urls_total: queue.len() as u32,
        urls_queued: queue.len() as u32,
        ..CrawlStats::default()
    };
    let start = Instant::now();

    let db_writer = Database::new(&base_domain)?;
    let app_emitter = app.clone();
    let result_handle = tokio::spawn(async move {
        let mut total_response_ms: u64 = 0;
        let mut count: u64 = 0;
        let mut batch: Vec<CrawlResult> = Vec::with_capacity(50);
        while let Some(result) = result_rx.recv().await {
            total_response_ms += result.response_time_ms;
            count += 1;
            let _ = app_emitter.emit("crawl-result", &result);
            batch.push(result);
            if batch.len() >= 50 {
                if let Err(e) = db_writer.insert_results_batch(&batch) {
                    error!(error = %e, "batch write to DB failed");
                }
                batch.clear();
            }
        }
        if !batch.is_empty() {
            if let Err(e) = db_writer.insert_results_batch(&batch) {
                error!(error = %e, "final batch write to DB failed");
            }
        }
        (total_response_ms, count)
    });

    // Conditionally launch headless Chrome for JS rendering
    let renderer: Option<Arc<JsRenderer>> =
        if config.rendering.rendering_mode == RenderingMode::Javascript {
            match JsRenderer::new(
                config.rendering.ajax_timeout_seconds,
                config.rendering.viewport_width,
                config.rendering.viewport_height,
                &effective_ua,
            ) {
                Ok(r) => {
                    info!("JS rendering enabled — Chrome launched");
                    Some(Arc::new(r))
                }
                Err(e) => {
                    warn!(error = %e, "Chrome launch failed, falling back to text-only");
                    None
                }
            }
        } else {
            None
        };

    // ── Phase 2: Robots.txt enforcement ──
    let robots_checker: Option<Arc<RobotsChecker>> = if config.robots.mode != RobotsMode::Ignore {
        let base_url = Url::parse(&config.url).ok();
        if let Some(base) = base_url {
            match RobotsChecker::fetch(&client, &base).await {
                Some(checker) => {
                    info!(sitemaps = checker.sitemaps.len(), "robots.txt fetched");
                    Some(Arc::new(checker))
                }
                None => {
                    debug!("no robots.txt found or failed to fetch");
                    None
                }
            }
        } else {
            None
        }
    } else {
        None
    };

    // ── Phase 2: Sitemap parsing ──
    let mut sitemap_urls_set: HashSet<String> = HashSet::new();
    if config.page_links.crawl_linked_sitemaps {
        let sitemap_source_urls = if let Some(ref checker) = robots_checker {
            checker.sitemaps.clone()
        } else {
            // Try default /sitemap.xml
            if let Ok(base) = Url::parse(&config.url) {
                vec![format!(
                    "{}://{}/sitemap.xml",
                    base.scheme(),
                    base.host_str().unwrap_or_default()
                )]
            } else {
                vec![]
            }
        };

        if !sitemap_source_urls.is_empty() {
            let sitemap_results =
                sitemap_parser::fetch_and_parse_sitemaps(&client, sitemap_source_urls).await;
            info!(count = sitemap_results.len(), "sitemap URLs discovered");
            for sm_url in &sitemap_results {
                sitemap_urls_set.insert(sm_url.url.clone());
                if !visited.contains(&sm_url.url) {
                    visited.insert(sm_url.url.clone());
                    queue.push((sm_url.url.clone(), 0));
                    stats.urls_total += 1;
                }
            }
        }
    }

    let max_depth = config.limits.max_depth;
    let max_urls = config.limits.max_urls;
    let delay_ms = config.speed.delay_ms;
    let follow_external = config.page_links.external_links;
    let crawl_subdomains = config.page_links.crawl_all_subdomains;
    let robots_mode = config.robots.mode;
    let show_blocked = config.robots.show_blocked_internal;

    let shared_config = Arc::new(config.clone());
    let shared_robots = robots_checker.clone();
    let shared_sitemap_set = Arc::new(sitemap_urls_set);

    // Rate limiter: enforce max_urls_per_second if configured
    let rate_interval: Option<Duration> = if config.speed.max_urls_per_second > 0 {
        Some(Duration::from_secs_f64(
            1.0 / config.speed.max_urls_per_second as f64,
        ))
    } else {
        None
    };
    let mut last_dispatch = tokio::time::Instant::now();

    info!(
        queue = queue.len(),
        max_depth,
        max_urls,
        ?rate_interval,
        "entering main crawl loop"
    );

    while !queue.is_empty() {
        if *cancel_rx.borrow() {
            info!("crawl cancelled by user");
            break;
        }

        if max_urls > 0 && stats.urls_crawled >= max_urls {
            info!(max_urls, "max URL limit reached");
            break;
        }

        let batch_size = max_concurrent;
        let batch: Vec<(String, u32)> = queue.drain(..batch_size.min(queue.len())).collect();

        let mut handles = Vec::new();

        debug!(count = batch.len(), "processing batch");

        for (url, depth) in batch {
            if depth > max_depth {
                stats.urls_queued = queue.len() as u32;
                let _ = app.emit("crawl-stats", &stats);
                continue;
            }

            // Phase 2: Robots.txt check before crawling
            if robots_mode == RobotsMode::Respect {
                if let Some(ref checker) = shared_robots {
                    let ua = shared_config.effective_user_agent();
                    if !checker.is_allowed(&url, &ua) {
                        if show_blocked {
                            // Emit a blocked result
                            let mut blocked =
                                empty_result(&url, 0, String::new(), 0, 0, depth, String::new());
                            blocked.robots_blocked = true;
                            blocked.in_sitemap = shared_sitemap_set.contains(&url);
                            let _ = result_tx.send(blocked).await;
                        }
                        stats.urls_crawled += 1;
                        let _ = app.emit("crawl-stats", &stats);
                        continue;
                    }
                }
            }

            // Enforce rate limit
            if let Some(interval) = rate_interval {
                let elapsed = last_dispatch.elapsed();
                if elapsed < interval {
                    sleep(interval - elapsed).await;
                }
                last_dispatch = tokio::time::Instant::now();
            }

            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => break, // semaphore closed, stop crawl
            };
            let client = client.clone();
            let result_tx = result_tx.clone();
            let base_domain = base_domain.clone();
            let cfg = shared_config.clone();
            let renderer = renderer.clone();
            let is_in_sitemap = shared_sitemap_set.contains(&url);

            let handle = tokio::spawn(async move {
                let (mut result, discovered) =
                    fetch_and_parse(&client, &url, &base_domain, depth, &cfg, &renderer).await;
                result.in_sitemap = is_in_sitemap;
                let _ = result_tx.send(result).await;
                drop(permit);
                discovered
            });

            handles.push(handle);

            if delay_ms > 0 {
                sleep(Duration::from_millis(delay_ms)).await;
            }
        }

        for handle in handles {
            if let Ok(discovered_urls) = handle.await {
                for (new_url, new_depth) in discovered_urls {
                    if !visited.insert(new_url.clone()) {
                        continue;
                    }

                    if !passes_url_filters(&new_url, &include_regexes, &exclude_regexes) {
                        continue;
                    }

                    if !passes_url_limits(&new_url, &config) {
                        continue;
                    }

                    if !follow_external {
                        if let Ok(parsed) = Url::parse(&new_url) {
                            let domain = parsed
                                .domain()
                                .unwrap_or_default()
                                .trim_start_matches("www.");
                            if crawl_subdomains {
                                if !is_same_site(domain, &base_domain) {
                                    continue;
                                }
                            } else {
                                if domain != base_host {
                                    continue;
                                }
                            }
                        }
                    }

                    queue.push((new_url, new_depth));
                    stats.urls_total += 1;
                }
            }
            stats.urls_crawled += 1;
            stats.urls_queued = queue.len() as u32;
            stats.elapsed_seconds = start.elapsed().as_secs();
            let _ = app.emit("crawl-stats", &stats);
        }
    }

    drop(result_tx);
    if let Ok((total_ms, count)) = result_handle.await {
        if count > 0 {
            stats.avg_response_ms = total_ms / count;
        }
    }

    stats.is_running = false;
    stats.urls_queued = 0;
    info!(urls_crawled = stats.urls_crawled, "crawl finished");
    let _ = app.emit("crawl-stats", &stats);
    let _ = app.emit("crawl-complete", "done");

    Ok(())
}

async fn fetch_and_parse(
    client: &Client,
    url: &str,
    base_domain: &str,
    depth: u32,
    config: &CrawlConfig,
    renderer: &Option<Arc<JsRenderer>>,
) -> (CrawlResult, Vec<(String, u32)>) {
    let start = Instant::now();
    let max_redirects = config.limits.max_redirects as usize;

    // ── Manual redirect following to track the full chain ──
    let mut redirect_chain: Vec<RedirectHop> = Vec::new();
    let mut current_url = url.to_string();
    let mut seen_urls: HashSet<String> = HashSet::new();
    seen_urls.insert(current_url.clone());

    let final_response = loop {
        let response = match client.get(&current_url).send().await {
            Ok(r) => r,
            Err(e) => {
                return (
                    empty_result(
                        url,
                        0,
                        String::new(),
                        start.elapsed().as_millis() as u64,
                        0,
                        depth,
                        format!("Error: {}", e),
                    ),
                    vec![],
                );
            }
        };

        let status = response.status().as_u16();

        // If it's a redirect (3xx) and we should follow
        if (300..400).contains(&status) {
            if let Some(location) = response.headers().get("location") {
                if let Ok(loc_str) = location.to_str() {
                    // Resolve relative redirect URLs
                    let next_url = if let Ok(base) = Url::parse(&current_url) {
                        base.join(loc_str)
                            .map(|u| u.to_string())
                            .unwrap_or_else(|_| loc_str.to_string())
                    } else {
                        loc_str.to_string()
                    };

                    redirect_chain.push(RedirectHop {
                        url: current_url.clone(),
                        status_code: status,
                    });

                    // Detect redirect loops
                    if !seen_urls.insert(next_url.clone()) {
                        // Loop detected — record the loop hop and stop
                        redirect_chain.push(RedirectHop {
                            url: next_url,
                            status_code: 0, // marker for loop
                        });
                        break response;
                    }

                    // Check redirect limit
                    if redirect_chain.len() >= max_redirects {
                        break response;
                    }

                    current_url = next_url;
                    continue;
                }
            }
        }

        break response;
    };

    let final_url = current_url;
    let status = final_response.status().as_u16();
    let content_type = final_response
        .headers()
        .get("content-type")
        .map(|v| v.to_str().unwrap_or_default().to_string())
        .unwrap_or_default();
    let content_length = final_response.content_length().unwrap_or(0);

    // Capture curated response headers
    let response_headers = capture_response_headers(final_response.headers());

    let redirect_url = if !redirect_chain.is_empty() {
        final_url.clone()
    } else {
        String::new()
    };

    let response_time = start.elapsed().as_millis() as u64;

    // For the initial status_code on the CrawlResult, use the first response's status
    let initial_status = if !redirect_chain.is_empty() {
        redirect_chain[0].status_code
    } else {
        status
    };

    if !content_type.contains("text/html") {
        let mut result = empty_result(
            url,
            initial_status,
            content_type,
            response_time,
            content_length,
            depth,
            redirect_url,
        );
        result.redirect_chain = redirect_chain;
        result.response_headers = response_headers;
        return (result, vec![]);
    }

    let body = match final_response.text().await {
        Ok(b) => b,
        Err(_) => {
            let mut result = empty_result(
                url,
                initial_status,
                content_type,
                response_time,
                content_length,
                depth,
                redirect_url,
            );
            result.redirect_chain = redirect_chain;
            result.response_headers = response_headers;
            return (result, vec![]);
        }
    };

    // Content hash (MD5 of body)
    let content_hash = format!("{:x}", md5::compute(&body));

    // If JS rendering is enabled, render the page in headless Chrome
    let analysis_html = if let Some(ref renderer) = renderer {
        let render_url = final_url.clone();
        let renderer_clone = renderer.clone();
        match tokio::task::spawn_blocking(move || renderer_clone.render_page(&render_url)).await {
            Ok(Ok(rendered)) => rendered,
            Ok(Err(e)) => {
                warn!(url, error = %e, "JS render failed, using raw HTML");
                body.clone()
            }
            Err(e) => {
                warn!(url, error = %e, "JS render task panicked, using raw HTML");
                body.clone()
            }
        }
    } else {
        body.clone()
    };

    let parsed = HtmlParser::parse(
        &analysis_html,
        &final_url,
        base_domain,
        &config.custom_search,
        &config.custom_extraction,
    );

    // Phase 4: Compute security flags from response headers before moving
    let has_hsts = response_headers
        .iter()
        .any(|(k, _)| k == "strict-transport-security");
    let has_csp = response_headers
        .iter()
        .any(|(k, _)| k == "content-security-policy");
    let has_x_frame_options = response_headers.iter().any(|(k, _)| k == "x-frame-options");
    let has_x_content_type_options = response_headers
        .iter()
        .any(|(k, _)| k == "x-content-type-options");

    let discovered: Vec<(String, u32)> = parsed
        .links
        .iter()
        .map(|l| (l.clone(), depth + 1))
        .collect();

    let result = CrawlResult {
        url: url.to_string(),
        status_code: initial_status,
        content_type,
        response_time_ms: response_time,
        content_length,
        title: parsed.title,
        meta_description: parsed.meta_description,
        h1: parsed.h1,
        h2_count: parsed.h2_count,
        canonical: parsed.canonical,
        robots_meta: parsed.robots_meta,
        word_count: parsed.word_count,
        internal_links: parsed.internal_links,
        external_links: parsed.external_links,
        depth,
        redirect_url,
        indexable: parsed.indexable,
        custom_search_results: parsed.custom_search_results,
        custom_extraction_results: parsed.custom_extraction_results,
        images: parsed.images,
        images_count: parsed.images_count,
        images_missing_alt: parsed.images_missing_alt,
        hreflang: parsed.hreflang,
        structured_data_types: parsed.structured_data_types,
        structured_data: parsed.structured_data,
        og_title: parsed.og_title,
        og_description: parsed.og_description,
        og_image: parsed.og_image,
        twitter_card: parsed.twitter_card,
        twitter_title: parsed.twitter_title,
        meta_keywords: parsed.meta_keywords,
        h2s: parsed.h2s,
        css_count: parsed.css_count,
        js_count: parsed.js_count,
        inline_css_count: parsed.inline_css_count,
        inline_js_count: parsed.inline_js_count,
        total_resource_size: content_length,
        dom_depth: parsed.dom_depth,
        text_ratio: parsed.text_ratio,
        has_viewport_meta: parsed.has_viewport_meta,
        has_charset: parsed.has_charset,
        has_doctype: parsed.has_doctype,
        // Phase 1
        redirect_chain,
        content_hash,
        response_headers,
        meta_refresh: parsed.meta_refresh,
        rel_next: parsed.rel_next,
        rel_prev: parsed.rel_prev,
        // Phase 2 — in_sitemap set by caller, robots_blocked=false for successful fetches
        robots_blocked: false,
        in_sitemap: false,
        // Phase 3
        outlinks: parsed.outlinks,
        // Phase 4: Security — derive from response_headers (computed before move)
        has_hsts,
        has_csp,
        has_x_frame_options,
        has_x_content_type_options,
        mixed_content_count: parsed.mixed_content_count,
        insecure_form_count: parsed.insecure_form_count,
        title_count: parsed.title_count,
        h1_count: parsed.h1_count,
        h1_all: parsed.h1_all,
        meta_description_count: parsed.meta_description_count,
        lang_attribute: parsed.lang_attribute,
        raw_html: if config.advanced.store_html || config.rendering.store_rendered_html {
            body
        } else {
            String::new()
        },
        rendered_html: if config.rendering.store_rendered_html && renderer.is_some() {
            analysis_html
        } else {
            String::new()
        },
    };

    (result, discovered)
}

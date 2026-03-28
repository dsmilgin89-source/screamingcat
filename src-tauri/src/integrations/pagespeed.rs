use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PageSpeedResult {
    pub url: String,
    pub performance_score: f64,
    pub accessibility_score: f64,
    pub best_practices_score: f64,
    pub seo_score: f64,
    // Core Web Vitals
    pub fcp_ms: f64,           // First Contentful Paint
    pub lcp_ms: f64,           // Largest Contentful Paint
    pub tbt_ms: f64,           // Total Blocking Time
    pub cls: f64,              // Cumulative Layout Shift
    pub speed_index_ms: f64,   // Speed Index
    pub tti_ms: f64,           // Time to Interactive
    /// Non-empty if analysis failed
    pub error: String,
    /// True if analysis was successfully completed
    pub analyzed: bool,
}

impl PageSpeedResult {
    pub fn error_result(url: &str, err: &str) -> Self {
        Self {
            url: url.to_string(),
            performance_score: -1.0,
            accessibility_score: -1.0,
            best_practices_score: -1.0,
            seo_score: -1.0,
            fcp_ms: 0.0,
            lcp_ms: 0.0,
            tbt_ms: 0.0,
            cls: 0.0,
            speed_index_ms: 0.0,
            tti_ms: 0.0,
            error: err.to_string(),
            analyzed: false,
        }
    }
}

/// Run PageSpeed Insights for a single URL
pub async fn analyze_url(
    url: &str,
    api_key: &str,
    strategy: &str, // "mobile" | "desktop"
) -> PageSpeedResult {
    // Validate strategy
    let strategy_upper = match strategy.to_lowercase().as_str() {
        "mobile" => "MOBILE",
        "desktop" => "DESKTOP",
        _ => "MOBILE",
    };

    let api_url = format!(
        "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?\
        url={}&strategy={}&key={}&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO",
        urlencoding(url),
        strategy_upper,
        urlencoding(api_key),
    );

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
    {
        Ok(c) => c,
        Err(e) => return PageSpeedResult::error_result(url, &format!("HTTP client error: {}", e)),
    };

    let resp = match client.get(&api_url).send().await {
        Ok(r) => r,
        Err(e) => return PageSpeedResult::error_result(url, &e.to_string()),
    };

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let _text = resp.text().await.unwrap_or_default();
        return PageSpeedResult::error_result(url, &format!("API returned status {}", status));
    }

    let body: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => return PageSpeedResult::error_result(url, &e.to_string()),
    };

    let categories = &body["lighthouseResult"]["categories"];
    let audits = &body["lighthouseResult"]["audits"];

    let score = |cat: &str| -> f64 {
        categories[cat]["score"].as_f64().unwrap_or(0.0) * 100.0
    };

    let metric = |audit_id: &str| -> f64 {
        audits[audit_id]["numericValue"].as_f64().unwrap_or(0.0)
    };

    PageSpeedResult {
        url: url.to_string(),
        performance_score: score("performance"),
        accessibility_score: score("accessibility"),
        best_practices_score: score("best-practices"),
        seo_score: score("seo"),
        fcp_ms: metric("first-contentful-paint"),
        lcp_ms: metric("largest-contentful-paint"),
        tbt_ms: metric("total-blocking-time"),
        cls: audits["cumulative-layout-shift"]["numericValue"]
            .as_f64()
            .unwrap_or(0.0),
        speed_index_ms: metric("speed-index"),
        tti_ms: metric("interactive"),
        error: String::new(),
        analyzed: true,
    }
}

fn urlencoding(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

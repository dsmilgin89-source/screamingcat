use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GscPageData {
    pub url: String,
    pub clicks: f64,
    pub impressions: f64,
    pub ctr: f64,
    pub position: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GscQueryData {
    pub query: String,
    pub url: String,
    pub clicks: f64,
    pub impressions: f64,
    pub ctr: f64,
    pub position: f64,
}

#[derive(Debug, Deserialize)]
struct GscApiResponse {
    rows: Option<Vec<GscApiRow>>,
}

#[derive(Debug, Deserialize)]
struct GscApiRow {
    keys: Vec<String>,
    clicks: f64,
    impressions: f64,
    ctr: f64,
    position: f64,
}

/// Normalize URL for matching: remove trailing slash
fn normalize_url(url: &str) -> String {
    let trimmed = url.trim_end_matches('/');
    if trimmed.is_empty() { url.to_string() } else { trimmed.to_string() }
}

/// Fetch Search Console data grouped by page
pub async fn fetch_page_data(
    site_url: &str,
    access_token: &str,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<GscPageData>, String> {
    let client = reqwest::Client::new();
    let api_url = format!(
        "https://www.googleapis.com/webmasters/v3/sites/{}/searchAnalytics/query",
        urlencoding(site_url)
    );

    let body = serde_json::json!({
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["page"],
        "rowLimit": 25000,
        "startRow": 0
    });

    let resp = client
        .post(&api_url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GSC API error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let _text = resp.text().await.unwrap_or_default();
        if status == 401 {
            return Err("GSC authentication expired. Please reconnect in Settings → Integrations.".to_string());
        }
        return Err(format!("GSC API returned status {}. Please verify your Site URL and permissions.", status));
    }

    let data: GscApiResponse = resp
        .json()
        .await
        .map_err(|e| format!("GSC parse error: {}", e))?;

    let rows = data.rows.unwrap_or_default();
    let results: Vec<GscPageData> = rows
        .into_iter()
        .map(|row| GscPageData {
            url: normalize_url(row.keys.first().map(|s| s.as_str()).unwrap_or_default()),
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: (row.ctr * 100.0 * 100.0).round() / 100.0,
            position: (row.position * 100.0).round() / 100.0,
        })
        .collect();

    Ok(results)
}

/// Fetch Search Console data grouped by page + query
pub async fn fetch_query_data(
    site_url: &str,
    access_token: &str,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<GscQueryData>, String> {
    let client = reqwest::Client::new();
    let api_url = format!(
        "https://www.googleapis.com/webmasters/v3/sites/{}/searchAnalytics/query",
        urlencoding(site_url)
    );

    let body = serde_json::json!({
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["page", "query"],
        "rowLimit": 25000,
        "startRow": 0
    });

    let resp = client
        .post(&api_url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GSC API error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let _text = resp.text().await.unwrap_or_default();
        if status == 401 {
            return Err("GSC authentication expired. Please reconnect in Settings → Integrations.".to_string());
        }
        return Err(format!("GSC API returned status {}.", status));
    }

    let data: GscApiResponse = resp
        .json()
        .await
        .map_err(|e| format!("GSC parse error: {}", e))?;

    let rows = data.rows.unwrap_or_default();
    let results: Vec<GscQueryData> = rows
        .into_iter()
        .map(|row| GscQueryData {
            url: normalize_url(row.keys.first().map(|s| s.as_str()).unwrap_or_default()),
            query: row.keys.get(1).cloned().unwrap_or_default(),
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: (row.ctr * 100.0 * 100.0).round() / 100.0,
            position: (row.position * 100.0).round() / 100.0,
        })
        .collect();

    Ok(results)
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

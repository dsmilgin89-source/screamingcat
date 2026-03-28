use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GaPageData {
    pub url: String,
    pub sessions: f64,
    pub users: f64,
    pub page_views: f64,
    pub avg_engagement_time: f64,  // in seconds
    pub bounce_rate: f64,          // percentage
    pub conversions: f64,
}

#[derive(Debug, Deserialize)]
struct Ga4Response {
    rows: Option<Vec<Ga4Row>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ga4Row {
    dimension_values: Vec<Ga4Value>,
    metric_values: Vec<Ga4Value>,
}

#[derive(Debug, Deserialize)]
struct Ga4Value {
    value: String,
}

/// Fetch Google Analytics 4 page-level data
/// Uses fullPageUrl dimension to enable proper URL matching with crawl results
pub async fn fetch_page_data(
    property_id: &str,
    access_token: &str,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<GaPageData>, String> {
    // Validate property_id contains only digits
    if !property_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("GA4 Property ID must be numeric".to_string());
    }

    // Validate date format (YYYY-MM-DD)
    let date_ok = |d: &str| -> bool {
        d.len() == 10 && d.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() }
        })
    };
    if !date_ok(start_date) || !date_ok(end_date) {
        return Err("Dates must be in YYYY-MM-DD format".to_string());
    }

    let client = reqwest::Client::new();
    let api_url = format!(
        "https://analyticsdata.googleapis.com/v1beta/properties/{}:runReport",
        property_id
    );

    let body = serde_json::json!({
        "dateRanges": [{
            "startDate": start_date,
            "endDate": end_date
        }],
        "dimensions": [
            { "name": "fullPageUrl" }
        ],
        "metrics": [
            { "name": "sessions" },
            { "name": "totalUsers" },
            { "name": "screenPageViews" },
            { "name": "averageSessionDuration" },
            { "name": "bounceRate" },
            { "name": "keyEvents" }
        ],
        "limit": 25000,
        "offset": 0
    });

    let resp = client
        .post(&api_url)
        .bearer_auth(access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GA4 API error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let _text = resp.text().await.unwrap_or_default();
        if status == 401 {
            return Err("GA4 authentication expired. Please reconnect in Settings → Integrations.".to_string());
        }
        return Err(format!("GA4 API returned status {}. Please verify your Property ID and permissions.", status));
    }

    let data: Ga4Response = resp
        .json()
        .await
        .map_err(|e| format!("GA4 parse error: {}", e))?;

    let rows = data.rows.unwrap_or_default();
    let results: Vec<GaPageData> = rows
        .into_iter()
        .filter_map(|row| {
            let raw_url = row.dimension_values.first()?.value.clone();
            // Normalize URL: ensure trailing slash consistency
            let url = normalize_url(&raw_url);
            let metric = |idx: usize| -> f64 {
                row.metric_values
                    .get(idx)
                    .and_then(|v| v.value.parse().ok())
                    .unwrap_or(0.0)
            };
            Some(GaPageData {
                url,
                sessions: metric(0),
                users: metric(1),
                page_views: metric(2),
                avg_engagement_time: (metric(3) * 100.0).round() / 100.0,
                bounce_rate: (metric(4) * 100.0).round() / 100.0,
                conversions: metric(5),
            })
        })
        .collect();

    Ok(results)
}

/// Normalize URL for matching: lowercase scheme+host, remove trailing slash from path
fn normalize_url(url: &str) -> String {
    // Remove trailing slash for path-only URLs, but keep the full URL
    let trimmed = url.trim_end_matches('/');
    if trimmed.is_empty() { url.to_string() } else { trimmed.to_string() }
}

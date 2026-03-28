use reqwest::Client;
use serde::{Deserialize, Serialize};
use sitemap::reader::{SiteMapEntity, SiteMapReader};
use std::io::Cursor;
use tracing::warn;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SitemapUrl {
    pub url: String,
    pub lastmod: Option<String>,
    pub changefreq: Option<String>,
    pub priority: Option<f64>,
}

/// Fetch and parse sitemaps recursively (handles sitemap index files).
/// Returns all discovered URLs from all sitemaps.
pub async fn fetch_and_parse_sitemaps(
    client: &Client,
    sitemap_urls: Vec<String>,
) -> Vec<SitemapUrl> {
    let mut all_urls = Vec::new();
    let mut to_fetch = sitemap_urls;
    let mut fetched = std::collections::HashSet::new();
    let max_sitemaps = 50; // safety limit

    while let Some(sitemap_url) = to_fetch.pop() {
        if fetched.len() >= max_sitemaps {
            break;
        }
        if !fetched.insert(sitemap_url.clone()) {
            continue; // already processed
        }

        match fetch_single_sitemap(client, &sitemap_url).await {
            Ok((urls, sub_sitemaps)) => {
                all_urls.extend(urls);
                to_fetch.extend(sub_sitemaps);
            }
            Err(e) => {
                warn!(url = %sitemap_url, error = %e, "failed to parse sitemap");
            }
        }
    }

    all_urls
}

async fn fetch_single_sitemap(
    client: &Client,
    url: &str,
) -> Result<(Vec<SitemapUrl>, Vec<String>), Box<dyn std::error::Error + Send + Sync>> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} for {}", response.status(), url).into());
    }

    let body = response.bytes().await?;
    let reader = SiteMapReader::new(Cursor::new(body));

    let mut urls = Vec::new();
    let mut sub_sitemaps = Vec::new();

    for entity in reader {
        match entity {
            SiteMapEntity::Url(entry) => {
                let loc = match &entry.loc {
                    sitemap::structs::Location::Url(u) => u.to_string(),
                    sitemap::structs::Location::None => continue,
                    _ => continue,
                };

                let lastmod = match &entry.lastmod {
                    sitemap::structs::LastMod::DateTime(dt) => Some(dt.to_rfc3339()),
                    _ => None,
                };

                let changefreq = match &entry.changefreq {
                    sitemap::structs::ChangeFreq::None => None,
                    cf => Some(format!("{:?}", cf)),
                };

                let priority = match &entry.priority {
                    sitemap::structs::Priority::Value(v) => Some(*v as f64),
                    _ => None,
                };

                urls.push(SitemapUrl {
                    url: loc,
                    lastmod,
                    changefreq,
                    priority,
                });
            }
            SiteMapEntity::SiteMap(entry) => {
                if let sitemap::structs::Location::Url(u) = &entry.loc {
                    sub_sitemaps.push(u.to_string());
                }
            }
            SiteMapEntity::Err(e) => {
                warn!(error = ?e, "sitemap entry parse error");
            }
        }
    }

    Ok((urls, sub_sitemaps))
}

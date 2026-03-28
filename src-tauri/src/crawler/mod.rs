pub mod engine;
pub mod robots;
pub mod sitemap_parser;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomFieldResult {
    pub name: String,
    pub value: String,
    pub count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageInfo {
    pub src: String,
    pub alt: String,
    pub has_alt: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HreflangEntry {
    pub lang: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RedirectHop {
    pub url: String,
    pub status_code: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StructuredDataItem {
    pub schema_type: String,
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CrawlResult {
    pub url: String,
    pub status_code: u16,
    pub content_type: String,
    pub response_time_ms: u64,
    pub content_length: u64,
    pub title: String,
    pub meta_description: String,
    pub h1: String,
    pub h2_count: u32,
    pub canonical: String,
    pub robots_meta: String,
    pub word_count: u32,
    pub internal_links: u32,
    pub external_links: u32,
    pub depth: u32,
    pub redirect_url: String,
    pub indexable: bool,
    pub custom_search_results: Vec<CustomFieldResult>,
    pub custom_extraction_results: Vec<CustomFieldResult>,
    // Images & media
    pub images: Vec<ImageInfo>,
    pub images_count: u32,
    pub images_missing_alt: u32,
    // Internationalization
    pub hreflang: Vec<HreflangEntry>,
    // Structured data
    pub structured_data_types: Vec<String>,
    pub structured_data: Vec<StructuredDataItem>,
    // Social
    pub og_title: String,
    pub og_description: String,
    pub og_image: String,
    pub twitter_card: String,
    pub twitter_title: String,
    // Meta
    pub meta_keywords: String,
    pub h2s: Vec<String>,
    // Performance
    pub css_count: u32,
    pub js_count: u32,
    pub inline_css_count: u32,
    pub inline_js_count: u32,
    pub total_resource_size: u64,
    pub dom_depth: u32,
    pub text_ratio: f32,
    pub has_viewport_meta: bool,
    pub has_charset: bool,
    pub has_doctype: bool,
    // Phase 1: Redirect chains, headers, hashing, pagination
    pub redirect_chain: Vec<RedirectHop>,
    pub content_hash: String,
    pub response_headers: Vec<(String, String)>,
    pub meta_refresh: String,
    pub rel_next: String,
    pub rel_prev: String,
    // Phase 2: Robots & Sitemaps
    pub robots_blocked: bool,
    pub in_sitemap: bool,
    // Phase 3: Anchor text + inlinks
    pub outlinks: Vec<LinkInfo>,
    // Phase 4: Security analysis
    pub has_hsts: bool,
    pub has_csp: bool,
    pub has_x_frame_options: bool,
    pub has_x_content_type_options: bool,
    pub mixed_content_count: u32,
    pub insecure_form_count: u32,
    // Audit: multiple tag detection
    pub title_count: u32,
    pub h1_count: u32,
    pub h1_all: Vec<String>,
    pub meta_description_count: u32,
    pub lang_attribute: String,
    // HTML source storage (in-memory only, not persisted to DB)
    #[serde(default)]
    pub raw_html: String,
    #[serde(default)]
    pub rendered_html: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinkInfo {
    pub source_url: String,
    pub target_url: String,
    pub anchor_text: String,
    pub rel: String,
    pub is_internal: bool,
    pub link_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CrawlStats {
    pub urls_crawled: u32,
    pub urls_queued: u32,
    pub urls_total: u32,
    pub status_2xx: u32,
    pub status_3xx: u32,
    pub status_4xx: u32,
    pub status_5xx: u32,
    pub avg_response_ms: u64,
    pub is_running: bool,
    pub elapsed_seconds: u64,
}

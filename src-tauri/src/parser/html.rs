use crate::crawler::{CustomFieldResult, HreflangEntry, ImageInfo, LinkInfo, StructuredDataItem};
use crate::{CustomExtractionConfig, CustomSearchConfig};
use scraper::{Html, Selector};
use std::collections::HashSet;
use std::sync::LazyLock;
use url::Url;

static JSON_LD_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"<script[^>]*type\s*=\s*["']application/ld\+json["'][^>]*>([\s\S]*?)</script>"#).unwrap()
});

// Cached CSS selectors — avoids recompiling per page
static SEL_TITLE: LazyLock<Selector> = LazyLock::new(|| Selector::parse("title").unwrap());
static SEL_H1: LazyLock<Selector> = LazyLock::new(|| Selector::parse("h1").unwrap());
static SEL_H2: LazyLock<Selector> = LazyLock::new(|| Selector::parse("h2").unwrap());
static SEL_BODY: LazyLock<Selector> = LazyLock::new(|| Selector::parse("body").unwrap());
static SEL_HTML: LazyLock<Selector> = LazyLock::new(|| Selector::parse("html").unwrap());
static SEL_CANONICAL: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"link[rel="canonical"]"#).unwrap());
static SEL_IMG: LazyLock<Selector> = LazyLock::new(|| Selector::parse("img").unwrap());
static SEL_A_HREF: LazyLock<Selector> = LazyLock::new(|| Selector::parse("a[href]").unwrap());
static SEL_HREFLANG: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"link[rel="alternate"][hreflang]"#).unwrap());
static SEL_STYLESHEET: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"link[rel="stylesheet"]"#).unwrap());
static SEL_SCRIPT: LazyLock<Selector> = LazyLock::new(|| Selector::parse("script").unwrap());
static SEL_STYLE: LazyLock<Selector> = LazyLock::new(|| Selector::parse("style").unwrap());
static SEL_STAR: LazyLock<Selector> = LazyLock::new(|| Selector::parse("*").unwrap());
static SEL_VIEWPORT: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="viewport"]"#).unwrap());
static SEL_CHARSET: LazyLock<Selector> = LazyLock::new(|| Selector::parse("meta[charset]").unwrap());
static SEL_HTTP_EQUIV_CT: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[http-equiv="Content-Type"]"#).unwrap());
static SEL_MICRODATA: LazyLock<Selector> = LazyLock::new(|| Selector::parse("[itemscope][itemtype]").unwrap());
static SEL_META_DESC: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="description"]"#).unwrap());
static SEL_META_ROBOTS: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="robots"]"#).unwrap());
static SEL_META_KEYWORDS: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="keywords"]"#).unwrap());
static SEL_META_REFRESH: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse(r#"meta[http-equiv="refresh" i]"#)
        .unwrap_or_else(|_| Selector::parse(r#"meta[http-equiv="refresh"]"#).unwrap())
});
static SEL_REL_NEXT: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"link[rel="next"]"#).unwrap());
static SEL_REL_PREV: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"link[rel="prev"]"#).unwrap());
static SEL_FORM_ACTION: LazyLock<Selector> = LazyLock::new(|| Selector::parse("form[action]").unwrap());
// OG/Twitter meta selectors
static SEL_OG_TITLE_PROP: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[property="og:title"]"#).unwrap());
static SEL_OG_TITLE_NAME: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="og:title"]"#).unwrap());
static SEL_OG_DESC_PROP: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[property="og:description"]"#).unwrap());
static SEL_OG_DESC_NAME: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="og:description"]"#).unwrap());
static SEL_OG_IMAGE_PROP: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[property="og:image"]"#).unwrap());
static SEL_OG_IMAGE_NAME: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="og:image"]"#).unwrap());
static SEL_TW_CARD_PROP: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[property="twitter:card"]"#).unwrap());
static SEL_TW_CARD_NAME: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="twitter:card"]"#).unwrap());
static SEL_TW_TITLE_PROP: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[property="twitter:title"]"#).unwrap());
static SEL_TW_TITLE_NAME: LazyLock<Selector> = LazyLock::new(|| Selector::parse(r#"meta[name="twitter:title"]"#).unwrap());
// Security resource selectors
static SEL_IMG_SRC: LazyLock<Selector> = LazyLock::new(|| Selector::parse("img[src]").unwrap());
static SEL_SCRIPT_SRC: LazyLock<Selector> = LazyLock::new(|| Selector::parse("script[src]").unwrap());
static SEL_LINK_HREF: LazyLock<Selector> = LazyLock::new(|| Selector::parse("link[href]").unwrap());
static SEL_IFRAME_SRC: LazyLock<Selector> = LazyLock::new(|| Selector::parse("iframe[src]").unwrap());
static SEL_VIDEO_SRC: LazyLock<Selector> = LazyLock::new(|| Selector::parse("video[src]").unwrap());
static SEL_AUDIO_SRC: LazyLock<Selector> = LazyLock::new(|| Selector::parse("audio[src]").unwrap());
static SEL_SOURCE_SRC: LazyLock<Selector> = LazyLock::new(|| Selector::parse("source[src]").unwrap());

pub struct ParsedPage {
    pub title: String,
    pub meta_description: String,
    pub h1: String,
    pub h2_count: u32,
    pub canonical: String,
    pub robots_meta: String,
    pub word_count: u32,
    pub internal_links: u32,
    pub external_links: u32,
    pub links: Vec<String>,
    pub indexable: bool,
    pub custom_search_results: Vec<CustomFieldResult>,
    pub custom_extraction_results: Vec<CustomFieldResult>,
    pub images: Vec<ImageInfo>,
    pub images_count: u32,
    pub images_missing_alt: u32,
    pub hreflang: Vec<HreflangEntry>,
    pub structured_data_types: Vec<String>,
    pub structured_data: Vec<StructuredDataItem>,
    pub og_title: String,
    pub og_description: String,
    pub og_image: String,
    pub twitter_card: String,
    pub twitter_title: String,
    pub meta_keywords: String,
    pub h2s: Vec<String>,
    pub css_count: u32,
    pub js_count: u32,
    pub inline_css_count: u32,
    pub inline_js_count: u32,
    pub dom_depth: u32,
    pub text_ratio: f32,
    pub has_viewport_meta: bool,
    pub has_charset: bool,
    pub has_doctype: bool,
    // Phase 1
    pub meta_refresh: String,
    pub rel_next: String,
    pub rel_prev: String,
    // Phase 3
    pub outlinks: Vec<LinkInfo>,
    // Phase 4: Security
    pub mixed_content_count: u32,
    pub insecure_form_count: u32,
    // Audit: multiple tag detection
    pub title_count: u32,
    pub h1_count: u32,
    pub h1_all: Vec<String>,
    pub meta_description_count: u32,
    pub lang_attribute: String,
}

pub struct HtmlParser;

impl HtmlParser {
    pub fn parse(
        html: &str,
        page_url: &str,
        base_domain: &str,
        custom_search: &CustomSearchConfig,
        custom_extraction: &CustomExtractionConfig,
    ) -> ParsedPage {
        let document = Html::parse_document(html);
        let base_url = Url::parse(page_url).ok();

        let title = Self::extract_title(&document);
        let meta_description = Self::extract_meta(&document, "description");
        let robots_meta = Self::extract_meta(&document, "robots");
        let h1 = Self::extract_first_heading(&document, "h1");
        let h2_count = Self::count_elements(&document, "h2");
        let h2s = Self::extract_h2_texts(&document);
        let canonical = Self::extract_canonical(&document);
        let word_count = Self::count_words(&document);
        let (links, internal_links, external_links, outlinks) =
            Self::extract_links(&document, &base_url, base_domain, page_url);

        let indexable = !robots_meta.contains("noindex")
            && (canonical.is_empty() || canonical == page_url);

        // Extract images
        let (images, images_count, images_missing_alt) = Self::extract_images(&document, &base_url);

        // Extract hreflang
        let hreflang = Self::extract_hreflang(&document);

        // Extract structured data (JSON-LD)
        let (mut structured_data_types, structured_data) = Self::extract_structured_data(html);

        // Also detect Microdata types and add to structured_data_types
        for el in document.select(&SEL_MICRODATA) {
            if let Some(itemtype) = el.value().attr("itemtype") {
                let type_name = itemtype.trim()
                    .rsplit('/')
                    .next()
                    .unwrap_or(itemtype.trim())
                    .to_string();
                if !structured_data_types.contains(&type_name) {
                    structured_data_types.push(type_name);
                }
            }
        }

        // Extract Open Graph tags
        let og_title = Self::extract_og_meta(&document, "og:title");
        let og_description = Self::extract_og_meta(&document, "og:description");
        let og_image = Self::extract_og_meta(&document, "og:image");

        // Extract Twitter Card tags
        let twitter_card = Self::extract_og_meta(&document, "twitter:card");
        let twitter_title = Self::extract_og_meta(&document, "twitter:title");

        // Extract meta keywords
        let meta_keywords = Self::extract_meta(&document, "keywords");

        // Run custom search rules
        let custom_search_results = Self::run_custom_search(html, &document, custom_search);

        // Run custom extraction rules
        let custom_extraction_results =
            Self::run_custom_extraction(html, &document, custom_extraction);

        // Performance analysis
        let (css_count, js_count, inline_css_count, inline_js_count) =
            Self::extract_resource_counts(&document);
        let dom_depth = Self::calculate_dom_depth(&document);
        let text_ratio = Self::calculate_text_ratio(&document, html);
        let has_viewport_meta = Self::check_viewport_meta(&document);
        let has_charset = Self::check_charset(&document);
        let has_doctype = Self::check_doctype(html);

        // Phase 1: meta refresh, pagination
        let meta_refresh = Self::extract_meta_refresh(&document);
        let (rel_next, rel_prev) = Self::extract_pagination(&document);

        // Phase 4: Security analysis
        let (mixed_content_count, insecure_form_count) = Self::extract_security_info(&document, page_url);

        // Audit: multiple tag detection
        let title_count = Self::count_elements(&document, "title");
        let h1_count = Self::count_elements(&document, "h1");
        let h1_all = {
            document.select(&SEL_H1)
                .take(10)
                .map(|el| el.text().collect::<String>().trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        };
        let meta_description_count = document.select(&SEL_META_DESC).count() as u32;
        let lang_attribute = {
            document.select(&SEL_HTML)
                .next()
                .and_then(|el| el.value().attr("lang"))
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        };

        ParsedPage {
            title,
            meta_description,
            h1,
            h2_count,
            h2s,
            canonical,
            robots_meta,
            word_count,
            internal_links,
            external_links,
            links,
            indexable,
            custom_search_results,
            custom_extraction_results,
            images,
            images_count,
            images_missing_alt,
            hreflang,
            structured_data_types,
            structured_data,
            og_title,
            og_description,
            og_image,
            twitter_card,
            twitter_title,
            meta_keywords,
            css_count,
            js_count,
            inline_css_count,
            inline_js_count,
            dom_depth,
            text_ratio,
            has_viewport_meta,
            has_charset,
            has_doctype,
            meta_refresh,
            rel_next,
            rel_prev,
            outlinks,
            mixed_content_count,
            insecure_form_count,
            title_count,
            h1_count,
            h1_all,
            meta_description_count,
            lang_attribute,
        }
    }

    fn extract_title(doc: &Html) -> String {
        doc.select(&SEL_TITLE)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default()
    }

    fn extract_meta(doc: &Html, name: &str) -> String {
        let sel: &Selector = match name {
            "description" => &SEL_META_DESC,
            "robots" => &SEL_META_ROBOTS,
            "keywords" => &SEL_META_KEYWORDS,
            _ => {
                // Fallback for unknown meta names
                if let Ok(s) = Selector::parse(&format!("meta[name=\"{}\"]", name)) {
                    let result = doc.select(&s)
                        .next()
                        .and_then(|el| el.value().attr("content"))
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default();
                    return result;
                }
                return String::new();
            }
        };
        doc.select(sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    }

    /// Extract Open Graph or Twitter meta tags (property-based)
    fn extract_og_meta(doc: &Html, property: &str) -> String {
        // Use cached selectors for known properties
        let (prop_sel, name_sel): (&Selector, &Selector) = match property {
            "og:title" => (&SEL_OG_TITLE_PROP, &SEL_OG_TITLE_NAME),
            "og:description" => (&SEL_OG_DESC_PROP, &SEL_OG_DESC_NAME),
            "og:image" => (&SEL_OG_IMAGE_PROP, &SEL_OG_IMAGE_NAME),
            "twitter:card" => (&SEL_TW_CARD_PROP, &SEL_TW_CARD_NAME),
            "twitter:title" => (&SEL_TW_TITLE_PROP, &SEL_TW_TITLE_NAME),
            _ => {
                // Fallback for unknown properties
                if let (Ok(p), Ok(n)) = (
                    Selector::parse(&format!("meta[property=\"{}\"]", property)),
                    Selector::parse(&format!("meta[name=\"{}\"]", property)),
                ) {
                    if let Some(el) = doc.select(&p).next() {
                        if let Some(c) = el.value().attr("content") { return c.trim().to_string(); }
                    }
                    if let Some(el) = doc.select(&n).next() {
                        if let Some(c) = el.value().attr("content") { return c.trim().to_string(); }
                    }
                }
                return String::new();
            }
        };
        // Try property attribute first (OG standard)
        if let Some(el) = doc.select(prop_sel).next() {
            if let Some(content) = el.value().attr("content") {
                return content.trim().to_string();
            }
        }
        // Fallback to name attribute (Twitter standard)
        if let Some(el) = doc.select(name_sel).next() {
            if let Some(content) = el.value().attr("content") {
                return content.trim().to_string();
            }
        }
        String::new()
    }

    fn extract_first_heading(doc: &Html, tag: &str) -> String {
        let sel_ref: &Selector = match tag {
            "h1" => &SEL_H1,
            "h2" => &SEL_H2,
            _ => {
                if let Ok(s) = Selector::parse(tag) {
                    return doc.select(&s).next()
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .unwrap_or_default();
                }
                return String::new();
            }
        };
        doc.select(sel_ref)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default()
    }

    fn extract_h2_texts(doc: &Html) -> Vec<String> {
        doc.select(&SEL_H2)
            .take(20) // Limit to first 20 H2s
            .map(|el| el.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    }

    fn count_elements(doc: &Html, tag: &str) -> u32 {
        let sel_ref: &Selector = match tag {
            "title" => &SEL_TITLE,
            "h1" => &SEL_H1,
            "h2" => &SEL_H2,
            _ => {
                if let Ok(s) = Selector::parse(tag) {
                    return doc.select(&s).count() as u32;
                }
                return 0;
            }
        };
        doc.select(sel_ref).count() as u32
    }

    fn extract_canonical(doc: &Html) -> String {
        doc.select(&SEL_CANONICAL)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    }

    fn count_words(doc: &Html) -> u32 {
        doc.select(&SEL_BODY)
            .next()
            .map(|body| {
                body.text()
                    .collect::<String>()
                    .split_whitespace()
                    .count() as u32
            })
            .unwrap_or(0)
    }

    /// Extract all images from the page
    fn extract_images(doc: &Html, base_url: &Option<Url>) -> (Vec<ImageInfo>, u32, u32) {
        let mut images = Vec::new();
        let mut count = 0u32;
        let mut missing_alt = 0u32;

        for element in doc.select(&SEL_IMG) {
            count += 1;

            let src_raw = element.value().attr("src").unwrap_or_default().trim().to_string();
            // Resolve relative URLs
            let src = if let Some(base) = base_url {
                base.join(&src_raw)
                    .map(|u| u.to_string())
                    .unwrap_or(src_raw)
            } else {
                src_raw
            };

            let has_alt = element.value().attr("alt").is_some();
            let alt = element.value().attr("alt").unwrap_or_default().trim().to_string();

            if !has_alt || alt.is_empty() {
                missing_alt += 1;
            }

            images.push(ImageInfo {
                src,
                alt,
                has_alt,
            });
        }

        (images, count, missing_alt)
    }

    /// Extract hreflang link elements
    fn extract_hreflang(doc: &Html) -> Vec<HreflangEntry> {
        let mut entries = Vec::new();

        for element in doc.select(&SEL_HREFLANG) {
            let lang = element.value().attr("hreflang").unwrap_or_default().trim().to_string();
            let url = element.value().attr("href").unwrap_or_default().trim().to_string();
            if !lang.is_empty() && !url.is_empty() {
                entries.push(HreflangEntry { lang, url });
            }
        }

        entries
    }

    /// Extract JSON-LD structured data @type values and validate each block
    fn extract_structured_data(html: &str) -> (Vec<String>, Vec<StructuredDataItem>) {
        let mut types = Vec::new();
        let mut items = Vec::new();
        for cap in JSON_LD_RE.captures_iter(html) {
            if let Some(json_str) = cap.get(1) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                    Self::collect_schema_types(&value, &mut types);
                    Self::collect_structured_data_items(&value, &mut items);
                }
            }
        }
        types.sort();
        types.dedup();
        (types, items)
    }

    /// Recursively collect StructuredDataItem entries with validation
    fn collect_structured_data_items(value: &serde_json::Value, items: &mut Vec<StructuredDataItem>) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(t) = map.get("@type") {
                    let type_names: Vec<String> = match t {
                        serde_json::Value::String(s) => vec![s.clone()],
                        serde_json::Value::Array(arr) => {
                            arr.iter().filter_map(|v| {
                                if let serde_json::Value::String(s) = v { Some(s.clone()) } else { None }
                            }).collect()
                        }
                        _ => vec![],
                    };

                    for type_name in &type_names {
                        let required = Self::required_properties_for_type(type_name);
                        let mut errors = Vec::new();
                        for prop in required {
                            if !map.contains_key(*prop) {
                                errors.push(format!("Missing required property: {}", prop));
                            }
                        }
                        // Review: needs reviewBody OR reviewRating (not both required)
                        if type_name == "Review" && !map.contains_key("reviewBody") && !map.contains_key("reviewRating") {
                            errors.push("Missing required property: reviewBody or reviewRating".to_string());
                        }
                        let is_valid = errors.is_empty();
                        items.push(StructuredDataItem {
                            schema_type: type_name.clone(),
                            is_valid,
                            errors,
                            warnings: vec![],
                        });
                    }
                }
                // Recurse into nested objects
                for (_, v) in map {
                    Self::collect_structured_data_items(v, items);
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    Self::collect_structured_data_items(item, items);
                }
            }
            _ => {}
        }
    }

    /// Return the required properties for a given schema.org @type
    fn required_properties_for_type(schema_type: &str) -> &'static [&'static str] {
        match schema_type {
            "Article" | "NewsArticle" | "BlogPosting" | "TechArticle" => &["headline", "author", "datePublished", "image"],
            "Product" => &["name"],
            "Organization" => &["name", "url"],
            "LocalBusiness" => &["name", "address"],
            "BreadcrumbList" => &["itemListElement"],
            "FAQPage" => &["mainEntity"],
            "WebSite" => &["name", "url"],
            "Person" => &["name"],
            "Event" => &["name", "startDate"],
            "Recipe" => &["name", "recipeIngredient"],
            "VideoObject" => &["name", "uploadDate"],
            "Review" => &[],  // handled with OR logic separately
            _ => &[],
        }
    }

    fn collect_schema_types(value: &serde_json::Value, types: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(t) = map.get("@type") {
                    match t {
                        serde_json::Value::String(s) => types.push(s.clone()),
                        serde_json::Value::Array(arr) => {
                            for item in arr {
                                if let serde_json::Value::String(s) = item {
                                    types.push(s.clone());
                                }
                            }
                        }
                        _ => {}
                    }
                }
                // Recurse into nested objects
                for (_, v) in map {
                    Self::collect_schema_types(v, types);
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    Self::collect_schema_types(item, types);
                }
            }
            _ => {}
        }
    }

    /// Count external CSS, external JS, inline CSS (<style>), and inline JS (<script> without src)
    fn extract_resource_counts(doc: &Html) -> (u32, u32, u32, u32) {
        let css_count = doc.select(&SEL_STYLESHEET).count() as u32;

        let mut js_count = 0u32;
        let mut inline_js_count = 0u32;
        for el in doc.select(&SEL_SCRIPT) {
            if el.value().attr("src").is_some() {
                js_count += 1;
            } else {
                let text: String = el.text().collect();
                if !text.trim().is_empty() {
                    inline_js_count += 1;
                }
            }
        }

        let inline_css_count = doc.select(&SEL_STYLE).count() as u32;

        (css_count, js_count, inline_css_count, inline_js_count)
    }

    /// Calculate maximum DOM nesting depth by scanning all elements for their ancestor count, capped at 100
    fn calculate_dom_depth(doc: &Html) -> u32 {
        let mut max_depth = 0u32;
        for el in doc.select(&SEL_STAR) {
            let depth = el.ancestors().count() as u32;
            if depth > max_depth {
                max_depth = depth;
            }
        }
        max_depth.min(100)
    }

    /// Calculate text-to-HTML ratio as a percentage (0-100)
    fn calculate_text_ratio(doc: &Html, html: &str) -> f32 {
        let html_len = html.len();
        if html_len == 0 {
            return 0.0;
        }
        let text_len: usize = doc
            .select(&SEL_BODY)
            .next()
            .map(|body| body.text().collect::<String>().len())
            .unwrap_or(0);
        (text_len as f32 / html_len as f32) * 100.0
    }

    /// Check if <meta name="viewport"> exists
    fn check_viewport_meta(doc: &Html) -> bool {
        doc.select(&SEL_VIEWPORT).next().is_some()
    }

    /// Check if charset is declared via <meta charset> or <meta http-equiv="Content-Type">
    fn check_charset(doc: &Html) -> bool {
        if doc.select(&SEL_CHARSET).next().is_some() {
            return true;
        }
        doc.select(&SEL_HTTP_EQUIV_CT).next().is_some()
    }

    /// Check if HTML starts with <!DOCTYPE (case-insensitive)
    fn check_doctype(html: &str) -> bool {
        html.trim_start().to_lowercase().starts_with("<!doctype")
    }

    fn extract_root_domain(domain: &str) -> String {
        let domain = domain.trim_start_matches("www.");
        let parts: Vec<&str> = domain.split('.').collect();

        let two_part_tlds = [
            "co.uk", "co.jp", "co.kr", "co.nz", "co.za", "co.in", "co.id",
            "com.au", "com.br", "com.pl", "com.ua", "com.tr", "com.mx",
            "com.ar", "com.cn", "com.tw", "com.hk", "com.sg",
            "org.uk", "org.au", "org.pl",
            "net.au", "net.pl",
        ];

        if parts.len() >= 3 {
            let last_two = format!("{}.{}", parts[parts.len() - 2], parts[parts.len() - 1]);
            if two_part_tlds.contains(&last_two.as_str()) {
                return parts[parts.len() - 3..].join(".");
            }
        }

        if parts.len() >= 2 {
            return parts[parts.len() - 2..].join(".");
        }

        domain.to_string()
    }

    fn normalize_url(url: &Url) -> String {
        let mut clean = url.clone();
        clean.set_fragment(None);
        let mut s = clean.to_string();
        if clean.path() == "/" && clean.query().is_none() {
            s = s.trim_end_matches('/').to_string();
        }
        s
    }

    fn extract_links(
        doc: &Html,
        base_url: &Option<Url>,
        base_domain: &str,
        page_url: &str,
    ) -> (Vec<String>, u32, u32, Vec<LinkInfo>) {
        let mut seen = HashSet::new();
        let mut links = Vec::new();
        let mut outlinks = Vec::new();
        let mut internal = 0u32;
        let mut external = 0u32;

        for element in doc.select(&SEL_A_HREF) {
            if let Some(href) = element.value().attr("href") {
                let href = href.trim();

                if href.starts_with('#')
                    || href.starts_with("javascript:")
                    || href.starts_with("mailto:")
                    || href.starts_with("tel:")
                {
                    continue;
                }

                let resolved = if let Some(base) = base_url {
                    base.join(href).map(|u| u.to_string()).ok()
                } else {
                    Url::parse(href).map(|u| u.to_string()).ok()
                };

                if let Some(resolved_url) = resolved {
                    if let Ok(parsed) = Url::parse(&resolved_url) {
                        let domain = parsed.domain().unwrap_or_default();
                        let domain_root = Self::extract_root_domain(domain);
                        let is_internal = domain_root == base_domain;
                        if is_internal {
                            internal += 1;
                        } else {
                            external += 1;
                        }

                        // Extract anchor text and rel attribute
                        let anchor_text = element.text().collect::<String>().trim().to_string();
                        let rel = element.value().attr("rel").unwrap_or_default().trim().to_lowercase();

                        if parsed.scheme() == "http" || parsed.scheme() == "https" {
                            let normalized = Self::normalize_url(&parsed);

                            outlinks.push(LinkInfo {
                                source_url: page_url.to_string(),
                                target_url: normalized.clone(),
                                anchor_text: if anchor_text.len() > 200 {
                                    anchor_text.chars().take(200).collect()
                                } else {
                                    anchor_text
                                },
                                rel,
                                is_internal,
                                link_type: "hyperlink".to_string(),
                            });

                            if seen.insert(normalized.clone()) {
                                links.push(normalized);
                            }
                        }
                    }
                }
            }
        }

        (links, internal, external, outlinks)
    }

    /// Run custom search rules against HTML source or visible text
    fn run_custom_search(
        html: &str,
        doc: &Html,
        config: &CustomSearchConfig,
    ) -> Vec<CustomFieldResult> {
        let mut results = Vec::new();

        let text_content = if config.rules.iter().any(|r| r.search_in == "text") {
            doc.select(&SEL_BODY)
                .next()
                .map(|body| body.text().collect::<String>())
                .unwrap_or_default()
        } else {
            String::new()
        };

        for rule in &config.rules {
            if rule.pattern.is_empty() {
                continue;
            }

            let search_target = match rule.search_in.as_str() {
                "text" => &text_content,
                _ => html,
            };

            let (found, count) = match rule.mode.as_str() {
                "regex" => {
                    let pattern = if rule.case_sensitive {
                        rule.pattern.clone()
                    } else {
                        format!("(?i){}", rule.pattern)
                    };
                    if let Ok(re) = regex::RegexBuilder::new(&pattern).size_limit(100_000).build() {
                        let matches: Vec<_> = re.find_iter(search_target).collect();
                        let count = matches.len() as u32;
                        let value = matches.first().map(|m| m.as_str().to_string()).unwrap_or_default();
                        (value, count)
                    } else {
                        (String::new(), 0)
                    }
                }
                _ => {
                    if rule.case_sensitive {
                        let count = search_target.matches(&rule.pattern).count() as u32;
                        let value = if count > 0 { rule.pattern.clone() } else { String::new() };
                        (value, count)
                    } else {
                        let haystack = search_target.to_lowercase();
                        let needle = rule.pattern.to_lowercase();
                        let count = haystack.matches(&needle).count() as u32;
                        let value = if count > 0 { rule.pattern.clone() } else { String::new() };
                        (value, count)
                    }
                }
            };

            results.push(CustomFieldResult {
                name: rule.name.clone(),
                value: found,
                count,
            });
        }

        results
    }

    /// Detect mixed content (HTTP resources on HTTPS pages) and insecure forms
    fn extract_security_info(doc: &Html, page_url: &str) -> (u32, u32) {
        let is_https = page_url.starts_with("https://");
        if !is_https {
            return (0, 0);
        }

        let mut mixed_count = 0u32;

        // Check img, script, link, iframe, video, audio, source for http:// src/href
        let resource_sels: &[(&Selector, &str)] = &[
            (&SEL_IMG_SRC, "src"),
            (&SEL_SCRIPT_SRC, "src"),
            (&SEL_LINK_HREF, "href"),
            (&SEL_IFRAME_SRC, "src"),
            (&SEL_VIDEO_SRC, "src"),
            (&SEL_AUDIO_SRC, "src"),
            (&SEL_SOURCE_SRC, "src"),
        ];

        for (sel, attr) in resource_sels {
            for el in doc.select(sel) {
                if let Some(val) = el.value().attr(attr) {
                    if val.trim().starts_with("http://") {
                        mixed_count += 1;
                    }
                }
            }
        }

        // Check forms with http:// action
        let mut insecure_forms = 0u32;
        for el in doc.select(&SEL_FORM_ACTION) {
            if let Some(action) = el.value().attr("action") {
                if action.trim().starts_with("http://") {
                    insecure_forms += 1;
                }
            }
        }

        (mixed_count, insecure_forms)
    }

    /// Extract meta http-equiv="refresh" content
    fn extract_meta_refresh(doc: &Html) -> String {
        doc.select(&SEL_META_REFRESH)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    }

    /// Extract rel=next and rel=prev pagination links
    fn extract_pagination(doc: &Html) -> (String, String) {
        let rel_next = doc.select(&SEL_REL_NEXT)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        let rel_prev = doc.select(&SEL_REL_PREV)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();

        (rel_next, rel_prev)
    }

    /// Run custom extraction rules (CSS selectors, regex) against HTML
    fn run_custom_extraction(
        html: &str,
        doc: &Html,
        config: &CustomExtractionConfig,
    ) -> Vec<CustomFieldResult> {
        let mut results = Vec::new();

        for rule in &config.rules {
            if rule.selector.is_empty() {
                continue;
            }

            let (value, count) = match rule.mode.as_str() {
                "css_selector" => {
                    if let Ok(sel) = Selector::parse(&rule.selector) {
                        let elements: Vec<_> = doc.select(&sel).collect();
                        let count = elements.len() as u32;
                        let value = elements.first().map(|el| {
                            match rule.target.as_str() {
                                "inner_html" => el.inner_html(),
                                "attribute" => {
                                    el.value()
                                        .attr(&rule.attribute)
                                        .unwrap_or_default()
                                        .to_string()
                                }
                                _ => {
                                    el.text().collect::<String>().trim().to_string()
                                }
                            }
                        }).unwrap_or_default();
                        (value, count)
                    } else {
                        (String::new(), 0)
                    }
                }
                "regex" => {
                    if let Ok(re) = regex::RegexBuilder::new(&rule.selector).size_limit(100_000).build() {
                        let matches: Vec<_> = re.find_iter(html).collect();
                        let count = matches.len() as u32;
                        let value = matches.first().map(|m| m.as_str().to_string()).unwrap_or_default();
                        (value, count)
                    } else {
                        (String::new(), 0)
                    }
                }
                _ => {
                    (String::new(), 0)
                }
            };

            results.push(CustomFieldResult {
                name: rule.name.clone(),
                value,
                count,
            });
        }

        results
    }
}

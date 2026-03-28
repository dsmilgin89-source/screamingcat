use crate::crawler::{CrawlResult, CustomFieldResult, HreflangEntry, ImageInfo, RedirectHop, StructuredDataItem};
use rusqlite::{params, Connection};
use std::io::Write;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(domain: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let sanitized: String = domain.chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .take(64)
            .collect();
        let db_path = std::env::temp_dir().join(format!("screamingcat_{}.db", sanitized));

        let conn = Connection::open(db_path)?;

        // Performance PRAGMAs
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -8000;
             PRAGMA mmap_size = 268435456;
             PRAGMA temp_store = MEMORY;"
        )?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                status_code INTEGER,
                content_type TEXT,
                response_time_ms INTEGER,
                content_length INTEGER,
                title TEXT,
                meta_description TEXT,
                h1 TEXT,
                h2_count INTEGER,
                canonical TEXT,
                robots_meta TEXT,
                word_count INTEGER,
                internal_links INTEGER,
                external_links INTEGER,
                depth INTEGER,
                redirect_url TEXT,
                indexable INTEGER,
                custom_search_results TEXT DEFAULT '[]',
                custom_extraction_results TEXT DEFAULT '[]',
                images TEXT DEFAULT '[]',
                images_count INTEGER DEFAULT 0,
                images_missing_alt INTEGER DEFAULT 0,
                hreflang TEXT DEFAULT '[]',
                structured_data_types TEXT DEFAULT '[]',
                structured_data TEXT DEFAULT '[]',
                og_title TEXT DEFAULT '',
                og_description TEXT DEFAULT '',
                og_image TEXT DEFAULT '',
                twitter_card TEXT DEFAULT '',
                twitter_title TEXT DEFAULT '',
                meta_keywords TEXT DEFAULT '',
                h2s TEXT DEFAULT '[]',
                css_count INTEGER DEFAULT 0,
                js_count INTEGER DEFAULT 0,
                inline_css_count INTEGER DEFAULT 0,
                inline_js_count INTEGER DEFAULT 0,
                total_resource_size INTEGER DEFAULT 0,
                dom_depth INTEGER DEFAULT 0,
                text_ratio REAL DEFAULT 0.0,
                has_viewport_meta INTEGER DEFAULT 0,
                has_charset INTEGER DEFAULT 0,
                has_doctype INTEGER DEFAULT 0,
                redirect_chain TEXT DEFAULT '[]',
                content_hash TEXT DEFAULT '',
                response_headers TEXT DEFAULT '[]',
                meta_refresh TEXT DEFAULT '',
                rel_next TEXT DEFAULT '',
                rel_prev TEXT DEFAULT '',
                robots_blocked INTEGER DEFAULT 0,
                in_sitemap INTEGER DEFAULT 0,
                outlinks TEXT DEFAULT '[]',
                has_hsts INTEGER DEFAULT 0,
                has_csp INTEGER DEFAULT 0,
                has_x_frame_options INTEGER DEFAULT 0,
                has_x_content_type_options INTEGER DEFAULT 0,
                mixed_content_count INTEGER DEFAULT 0,
                insecure_form_count INTEGER DEFAULT 0,
                title_count INTEGER NOT NULL DEFAULT 1,
                h1_count INTEGER NOT NULL DEFAULT 1,
                h1_all TEXT NOT NULL DEFAULT '[]',
                meta_description_count INTEGER NOT NULL DEFAULT 1,
                lang_attribute TEXT NOT NULL DEFAULT '',
                crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
        )?;

        // Migrate older schemas (silently ignore errors if columns exist)
        let new_cols = [
            "custom_search_results TEXT DEFAULT '[]'",
            "custom_extraction_results TEXT DEFAULT '[]'",
            "images TEXT DEFAULT '[]'",
            "images_count INTEGER DEFAULT 0",
            "images_missing_alt INTEGER DEFAULT 0",
            "hreflang TEXT DEFAULT '[]'",
            "structured_data_types TEXT DEFAULT '[]'",
            "structured_data TEXT DEFAULT '[]'",
            "og_title TEXT DEFAULT ''",
            "og_description TEXT DEFAULT ''",
            "og_image TEXT DEFAULT ''",
            "twitter_card TEXT DEFAULT ''",
            "twitter_title TEXT DEFAULT ''",
            "meta_keywords TEXT DEFAULT ''",
            "h2s TEXT DEFAULT '[]'",
            "css_count INTEGER DEFAULT 0",
            "js_count INTEGER DEFAULT 0",
            "inline_css_count INTEGER DEFAULT 0",
            "inline_js_count INTEGER DEFAULT 0",
            "total_resource_size INTEGER DEFAULT 0",
            "dom_depth INTEGER DEFAULT 0",
            "text_ratio REAL DEFAULT 0.0",
            "has_viewport_meta INTEGER DEFAULT 0",
            "has_charset INTEGER DEFAULT 0",
            "has_doctype INTEGER DEFAULT 0",
            // Phase 1
            "redirect_chain TEXT DEFAULT '[]'",
            "content_hash TEXT DEFAULT ''",
            "response_headers TEXT DEFAULT '[]'",
            "meta_refresh TEXT DEFAULT ''",
            "rel_next TEXT DEFAULT ''",
            "rel_prev TEXT DEFAULT ''",
            // Phase 2
            "robots_blocked INTEGER DEFAULT 0",
            "in_sitemap INTEGER DEFAULT 0",
            // Phase 3
            "outlinks TEXT DEFAULT '[]'",
            // Phase 4
            "has_hsts INTEGER DEFAULT 0",
            "has_csp INTEGER DEFAULT 0",
            "has_x_frame_options INTEGER DEFAULT 0",
            "has_x_content_type_options INTEGER DEFAULT 0",
            "mixed_content_count INTEGER DEFAULT 0",
            "insecure_form_count INTEGER DEFAULT 0",
            // Audit: multiple tag detection
            "title_count INTEGER NOT NULL DEFAULT 1",
            "h1_count INTEGER NOT NULL DEFAULT 1",
            "h1_all TEXT NOT NULL DEFAULT '[]'",
            "meta_description_count INTEGER NOT NULL DEFAULT 1",
            "lang_attribute TEXT NOT NULL DEFAULT ''",
        ];
        for col in &new_cols {
            let _ = conn.execute(&format!("ALTER TABLE results ADD COLUMN {}", col), []);
        }

        // Create indexes (after migrations so columns exist)
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_status ON results(status_code)", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_depth ON results(depth)", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_content_hash ON results(content_hash)", []);

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn insert_results_batch(
        &self,
        results: &[CrawlResult],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if results.is_empty() {
            return Ok(());
        }
        // Pre-serialize all JSON outside the lock
        let serialized: Vec<_> = results.iter().map(|result| {
            (
                serde_json::to_string(&result.custom_search_results).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.custom_extraction_results).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.images).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.hreflang).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.structured_data_types).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.structured_data).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.h2s).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.redirect_chain).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.response_headers).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.outlinks).unwrap_or_else(|_| "[]".to_string()),
                serde_json::to_string(&result.h1_all).unwrap_or_else(|_| "[]".to_string()),
            )
        }).collect();

        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute_batch("BEGIN")?;
        for (result, json) in results.iter().zip(serialized.iter()) {
            conn.execute(
                "INSERT OR REPLACE INTO results
                    (url, status_code, content_type, response_time_ms, content_length,
                     title, meta_description, h1, h2_count, canonical, robots_meta,
                     word_count, internal_links, external_links, depth, redirect_url, indexable,
                     custom_search_results, custom_extraction_results,
                     images, images_count, images_missing_alt,
                     hreflang, structured_data_types, structured_data,
                     og_title, og_description, og_image,
                     twitter_card, twitter_title,
                     meta_keywords, h2s,
                     css_count, js_count, inline_css_count, inline_js_count,
                     total_resource_size, dom_depth, text_ratio,
                     has_viewport_meta, has_charset, has_doctype,
                     redirect_chain, content_hash, response_headers,
                     meta_refresh, rel_next, rel_prev,
                     robots_blocked, in_sitemap, outlinks,
                     has_hsts, has_csp, has_x_frame_options, has_x_content_type_options,
                     mixed_content_count, insecure_form_count,
                     title_count, h1_count, h1_all, meta_description_count, lang_attribute)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                        ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31,
                        ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41, ?42,
                        ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50, ?51,
                        ?52, ?53, ?54, ?55, ?56, ?57,
                        ?58, ?59, ?60, ?61, ?62)",
                params![
                    result.url, result.status_code, result.content_type,
                    result.response_time_ms, result.content_length,
                    result.title, result.meta_description, result.h1,
                    result.h2_count, result.canonical, result.robots_meta,
                    result.word_count, result.internal_links, result.external_links,
                    result.depth, result.redirect_url, result.indexable as i32,
                    json.0, json.1, json.2, result.images_count, result.images_missing_alt,
                    json.3, json.4, json.5,
                    result.og_title, result.og_description, result.og_image,
                    result.twitter_card, result.twitter_title,
                    result.meta_keywords, json.6,
                    result.css_count, result.js_count, result.inline_css_count, result.inline_js_count,
                    result.total_resource_size, result.dom_depth, result.text_ratio,
                    result.has_viewport_meta as i32, result.has_charset as i32, result.has_doctype as i32,
                    json.7, result.content_hash, json.8,
                    result.meta_refresh, result.rel_next, result.rel_prev,
                    result.robots_blocked as i32, result.in_sitemap as i32, json.9,
                    result.has_hsts as i32, result.has_csp as i32,
                    result.has_x_frame_options as i32, result.has_x_content_type_options as i32,
                    result.mixed_content_count, result.insecure_form_count,
                    result.title_count, result.h1_count, json.10,
                    result.meta_description_count, result.lang_attribute,
                ],
            )?;
        }
        conn.execute_batch("COMMIT")?;
        Ok(())
    }

    pub fn get_results(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<Vec<CrawlResult>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let offset = page.saturating_mul(page_size);

        let mut stmt = conn.prepare(
            "SELECT url, status_code, content_type, response_time_ms, content_length,
                    title, meta_description, h1, h2_count, canonical, robots_meta,
                    word_count, internal_links, external_links, depth, redirect_url, indexable,
                    COALESCE(custom_search_results, '[]'),
                    COALESCE(custom_extraction_results, '[]'),
                    COALESCE(images, '[]'),
                    COALESCE(images_count, 0),
                    COALESCE(images_missing_alt, 0),
                    COALESCE(hreflang, '[]'),
                    COALESCE(structured_data_types, '[]'),
                    COALESCE(structured_data, '[]'),
                    COALESCE(og_title, ''),
                    COALESCE(og_description, ''),
                    COALESCE(og_image, ''),
                    COALESCE(twitter_card, ''),
                    COALESCE(twitter_title, ''),
                    COALESCE(meta_keywords, ''),
                    COALESCE(h2s, '[]'),
                    COALESCE(css_count, 0),
                    COALESCE(js_count, 0),
                    COALESCE(inline_css_count, 0),
                    COALESCE(inline_js_count, 0),
                    COALESCE(total_resource_size, 0),
                    COALESCE(dom_depth, 0),
                    COALESCE(text_ratio, 0.0),
                    COALESCE(has_viewport_meta, 0),
                    COALESCE(has_charset, 0),
                    COALESCE(has_doctype, 0),
                    COALESCE(redirect_chain, '[]'),
                    COALESCE(content_hash, ''),
                    COALESCE(response_headers, '[]'),
                    COALESCE(meta_refresh, ''),
                    COALESCE(rel_next, ''),
                    COALESCE(rel_prev, ''),
                    COALESCE(robots_blocked, 0),
                    COALESCE(in_sitemap, 0),
                    COALESCE(outlinks, '[]'),
                    COALESCE(has_hsts, 0),
                    COALESCE(has_csp, 0),
                    COALESCE(has_x_frame_options, 0),
                    COALESCE(has_x_content_type_options, 0),
                    COALESCE(mixed_content_count, 0),
                    COALESCE(insecure_form_count, 0),
                    COALESCE(title_count, 1),
                    COALESCE(h1_count, 1),
                    COALESCE(h1_all, '[]'),
                    COALESCE(meta_description_count, 1),
                    COALESCE(lang_attribute, '')
             FROM results ORDER BY id LIMIT ?1 OFFSET ?2",
        )?;

        let results = stmt
            .query_map(params![page_size, offset], |row| {
                let custom_search_results: Vec<CustomFieldResult> =
                    serde_json::from_str(&row.get::<_, String>(17)?).unwrap_or_default();
                let custom_extraction_results: Vec<CustomFieldResult> =
                    serde_json::from_str(&row.get::<_, String>(18)?).unwrap_or_default();
                let images: Vec<ImageInfo> =
                    serde_json::from_str(&row.get::<_, String>(19)?).unwrap_or_default();
                let hreflang: Vec<HreflangEntry> =
                    serde_json::from_str(&row.get::<_, String>(22)?).unwrap_or_default();
                let structured_data_types: Vec<String> =
                    serde_json::from_str(&row.get::<_, String>(23)?).unwrap_or_default();
                let structured_data: Vec<StructuredDataItem> =
                    serde_json::from_str(&row.get::<_, String>(24)?).unwrap_or_default();
                let h2s: Vec<String> =
                    serde_json::from_str(&row.get::<_, String>(31)?).unwrap_or_default();
                let redirect_chain: Vec<RedirectHop> =
                    serde_json::from_str(&row.get::<_, String>(42)?).unwrap_or_default();
                let response_headers: Vec<(String, String)> =
                    serde_json::from_str(&row.get::<_, String>(44)?).unwrap_or_default();

                Ok(CrawlResult {
                    url: row.get(0)?,
                    status_code: row.get(1)?,
                    content_type: row.get(2)?,
                    response_time_ms: row.get(3)?,
                    content_length: row.get(4)?,
                    title: row.get(5)?,
                    meta_description: row.get(6)?,
                    h1: row.get(7)?,
                    h2_count: row.get(8)?,
                    canonical: row.get(9)?,
                    robots_meta: row.get(10)?,
                    word_count: row.get(11)?,
                    internal_links: row.get(12)?,
                    external_links: row.get(13)?,
                    depth: row.get(14)?,
                    redirect_url: row.get(15)?,
                    indexable: row.get::<_, i32>(16)? != 0,
                    custom_search_results,
                    custom_extraction_results,
                    images,
                    images_count: row.get(20)?,
                    images_missing_alt: row.get(21)?,
                    hreflang,
                    structured_data_types,
                    structured_data,
                    og_title: row.get(25)?,
                    og_description: row.get(26)?,
                    og_image: row.get(27)?,
                    twitter_card: row.get(28)?,
                    twitter_title: row.get(29)?,
                    meta_keywords: row.get(30)?,
                    h2s,
                    css_count: row.get(32)?,
                    js_count: row.get(33)?,
                    inline_css_count: row.get(34)?,
                    inline_js_count: row.get(35)?,
                    total_resource_size: row.get(36)?,
                    dom_depth: row.get(37)?,
                    text_ratio: row.get::<_, f64>(38)? as f32,
                    has_viewport_meta: row.get::<_, i32>(39)? != 0,
                    has_charset: row.get::<_, i32>(40)? != 0,
                    has_doctype: row.get::<_, i32>(41)? != 0,
                    redirect_chain,
                    content_hash: row.get(43)?,
                    response_headers,
                    meta_refresh: row.get(45)?,
                    rel_next: row.get(46)?,
                    rel_prev: row.get(47)?,
                    robots_blocked: row.get::<_, i32>(48)? != 0,
                    in_sitemap: row.get::<_, i32>(49)? != 0,
                    outlinks: serde_json::from_str(&row.get::<_, String>(50)?).unwrap_or_default(),
                    has_hsts: row.get::<_, i32>(51)? != 0,
                    has_csp: row.get::<_, i32>(52)? != 0,
                    has_x_frame_options: row.get::<_, i32>(53)? != 0,
                    has_x_content_type_options: row.get::<_, i32>(54)? != 0,
                    mixed_content_count: row.get(55)?,
                    insecure_form_count: row.get(56)?,
                    title_count: row.get(57)?,
                    h1_count: row.get(58)?,
                    h1_all: serde_json::from_str(&row.get::<_, String>(59)?).unwrap_or_default(),
                    meta_description_count: row.get(60)?,
                    lang_attribute: row.get(61)?,
                    // HTML not stored in DB — always empty when loading from DB
                    raw_html: String::new(),
                    rendered_html: String::new(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    pub fn export_csv(
        &self,
        path: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT url, status_code, content_type, response_time_ms, content_length,
                    title, meta_description, h1, h2_count, canonical, robots_meta,
                    word_count, internal_links, external_links, depth, redirect_url, indexable,
                    COALESCE(images_count, 0), COALESCE(images_missing_alt, 0),
                    COALESCE(og_title, ''), COALESCE(meta_keywords, ''),
                    COALESCE(structured_data_types, '[]'),
                    COALESCE(content_hash, ''), COALESCE(meta_refresh, ''),
                    COALESCE(rel_next, ''), COALESCE(rel_prev, '')
             FROM results ORDER BY id",
        )?;

        let mut file = std::fs::File::create(path)?;

        writeln!(
            file,
            "URL,Status Code,Content Type,Response Time (ms),Content Length,Title,Meta Description,H1,H2 Count,Canonical,Robots Meta,Word Count,Internal Links,External Links,Depth,Redirect URL,Indexable,Images,Images Missing Alt,OG Title,Meta Keywords,Structured Data,Content Hash,Meta Refresh,Rel Next,Rel Prev"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u16>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, u64>(3)?,
                row.get::<_, u64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, u32>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, u32>(11)?,
                row.get::<_, u32>(12)?,
                row.get::<_, u32>(13)?,
                row.get::<_, u32>(14)?,
                row.get::<_, String>(15)?,
                row.get::<_, i32>(16)?,
                row.get::<_, u32>(17)?,
                row.get::<_, u32>(18)?,
                row.get::<_, String>(19)?,
                row.get::<_, String>(20)?,
                row.get::<_, String>(21)?,
                row.get::<_, String>(22)?,
                row.get::<_, String>(23)?,
                row.get::<_, String>(24)?,
                row.get::<_, String>(25)?,
            ))
        })?;

        for row in rows {
            let r = row?;
            writeln!(
                file,
                "\"{}\",{},\"{}\",{},{},\"{}\",\"{}\",\"{}\",{},\"{}\",\"{}\",{},{},{},{},\"{}\",{},{},{},\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"",
                r.0.replace('"', "\"\""), r.1, r.2.replace('"', "\"\""),
                r.3, r.4, r.5.replace('"', "\"\""), r.6.replace('"', "\"\""),
                r.7.replace('"', "\"\""), r.8, r.9.replace('"', "\"\""),
                r.10.replace('"', "\"\""), r.11, r.12, r.13, r.14,
                r.15.replace('"', "\"\""), r.16, r.17, r.18,
                r.19.replace('"', "\"\""), r.20.replace('"', "\"\""),
                r.21.replace('"', "\"\""), r.22.replace('"', "\"\""),
                r.23.replace('"', "\"\""), r.24.replace('"', "\"\""),
                r.25.replace('"', "\"\""),
            )?;
        }

        Ok(())
    }
}

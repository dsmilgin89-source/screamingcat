// ── Spider: Resource crawling ──
export interface ResourceCrawlOptions {
  check_images: boolean;
  check_css: boolean;
  check_javascript: boolean;
  check_media: boolean;
}

// ── Spider: Page link options ──
export interface PageLinkOptions {
  internal_links: boolean;
  external_links: boolean;
  canonicals: boolean;
  pagination: boolean;
  hreflang: boolean;
  meta_refresh: boolean;
  follow_internal_nofollow: boolean;
  follow_external_nofollow: boolean;
  crawl_linked_sitemaps: boolean;
  crawl_outside_start_folder: boolean;
  crawl_all_subdomains: boolean;
}

// ── Limits ──
export interface CrawlLimits {
  max_urls: number;
  max_depth: number;
  max_folder_depth: number;
  max_query_strings: number;
  max_redirects: number;
  max_url_length: number;
  max_page_size_kb: number;
  max_links_per_url: number;
}

// ── Speed ──
export interface SpeedConfig {
  max_threads: number;
  max_urls_per_second: number;
  delay_ms: number;
}

// ── User-Agent ──
export type UserAgentPreset =
  | "screamingcat"
  | "googlebot_desktop"
  | "googlebot_mobile"
  | "bingbot"
  | "chrome_desktop"
  | "firefox_desktop"
  | "custom";

export interface UserAgentConfig {
  preset: UserAgentPreset;
  custom_ua: string;
}

export const USER_AGENT_PRESETS: Record<UserAgentPreset, string> = {
  screamingcat: "ScreamingCAT/0.1 (+https://github.com/screamingcat)",
  googlebot_desktop:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebot_mobile:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot:
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  chrome_desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  firefox_desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  custom: "",
};

// ── Robots ──
export type RobotsMode = "respect" | "ignore" | "ignore_but_report";

export interface RobotsConfig {
  mode: RobotsMode;
  show_blocked_internal: boolean;
  show_blocked_external: boolean;
}

// ── Include/Exclude ──
export interface UrlFilterConfig {
  include_patterns: string[];
  exclude_patterns: string[];
}

// ── Extraction ──
export interface ExtractionConfig {
  page_titles: boolean;
  meta_descriptions: boolean;
  meta_keywords: boolean;
  h1: boolean;
  h2: boolean;
  canonicals: boolean;
  meta_robots: boolean;
  open_graph: boolean;
  twitter_cards: boolean;
  structured_data: boolean;
  word_count: boolean;
  response_time: boolean;
  indexability: boolean;
}

// ── Advanced ──
export interface AdvancedConfig {
  response_timeout_seconds: number;
  retry_5xx: number;
  respect_noindex: boolean;
  respect_canonical: boolean;
  always_follow_redirects: boolean;
  crawl_fragment_identifiers: boolean;
  store_html: boolean;
  // SEO length thresholds
  title_max_length: number;
  title_min_length: number;
  description_max_length: number;
  description_min_length: number;
  h1_max_length: number;
  max_image_size_kb: number;
  low_content_word_count: number;
}

// ── Rendering ──
export type RenderingMode = "text_only" | "javascript";

export interface RenderingConfig {
  rendering_mode: RenderingMode;
  ajax_timeout_seconds: number;
  viewport_width: number;
  viewport_height: number;
  store_rendered_html: boolean;
}

// ── Custom Search ──
export type CustomSearchMode = "contains" | "regex";

export interface CustomSearchRule {
  name: string;
  pattern: string;
  mode: CustomSearchMode;
  search_in: "html" | "text";
  case_sensitive: boolean;
}

export interface CustomSearchConfig {
  rules: CustomSearchRule[];
}

// ── Custom Extraction ──
export type CustomExtractionMode = "css_selector" | "xpath" | "regex";
export type CustomExtractionTarget = "inner_html" | "text" | "attribute";

export interface CustomExtractionRule {
  name: string;
  selector: string;
  mode: CustomExtractionMode;
  target: CustomExtractionTarget;
  attribute: string;
}

export interface CustomExtractionConfig {
  rules: CustomExtractionRule[];
}

// ── Custom HTTP Headers ──
export interface CustomHeader {
  name: string;
  value: string;
  enabled: boolean;
}

// ── Authentication ──
export interface AuthConfig {
  enabled: boolean;
  login_url: string;
  username_field: string;
  password_field: string;
  username: string;
  password: string;
  extra_fields: [string, string][];
}

// ── Full config ──
export interface CrawlConfig {
  url: string;
  resources: ResourceCrawlOptions;
  page_links: PageLinkOptions;
  limits: CrawlLimits;
  speed: SpeedConfig;
  user_agent: UserAgentConfig;
  robots: RobotsConfig;
  url_filters: UrlFilterConfig;
  extraction: ExtractionConfig;
  advanced: AdvancedConfig;
  rendering: RenderingConfig;
  custom_search: CustomSearchConfig;
  custom_extraction: CustomExtractionConfig;
  custom_headers: CustomHeader[];
  auth: AuthConfig;
}

// ── Defaults ──
export const defaultConfig: CrawlConfig = {
  url: "",
  resources: {
    check_images: true,
    check_css: true,
    check_javascript: true,
    check_media: false,
  },
  page_links: {
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
  limits: {
    max_urls: 0,
    max_depth: 10,
    max_folder_depth: 0,
    max_query_strings: 0,
    max_redirects: 10,
    max_url_length: 2048,
    max_page_size_kb: 0,
    max_links_per_url: 0,
  },
  speed: {
    max_threads: 8,
    max_urls_per_second: 0,
    delay_ms: 100,
  },
  user_agent: {
    preset: "screamingcat",
    custom_ua: "",
  },
  robots: {
    mode: "respect",
    show_blocked_internal: true,
    show_blocked_external: false,
  },
  url_filters: {
    include_patterns: [],
    exclude_patterns: [],
  },
  extraction: {
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
  advanced: {
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
  rendering: {
    rendering_mode: "text_only",
    ajax_timeout_seconds: 5,
    viewport_width: 1280,
    viewport_height: 800,
    store_rendered_html: false,
  },
  custom_search: { rules: [] },
  custom_extraction: { rules: [] },
  custom_headers: [],
  auth: {
    enabled: false,
    login_url: "",
    username_field: "username",
    password_field: "password",
    username: "",
    password: "",
    extra_fields: [],
  },
};

// ── Results ──
export interface CustomFieldResult {
  name: string;
  value: string;
  count: number;
}

export interface ImageInfo {
  src: string;
  alt: string;
  has_alt: boolean;
}

export interface HreflangEntry {
  lang: string;
  url: string;
}

export interface RedirectHop {
  url: string;
  status_code: number;
}

export interface StructuredDataItem {
  schema_type: string;
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CrawlResult {
  url: string;
  status_code: number;
  content_type: string;
  response_time_ms: number;
  content_length: number;
  title: string;
  meta_description: string;
  h1: string;
  h2_count: number;
  canonical: string;
  robots_meta: string;
  word_count: number;
  internal_links: number;
  external_links: number;
  depth: number;
  redirect_url: string;
  indexable: boolean;
  custom_search_results: CustomFieldResult[];
  custom_extraction_results: CustomFieldResult[];
  images: ImageInfo[];
  images_count: number;
  images_missing_alt: number;
  hreflang: HreflangEntry[];
  structured_data_types: string[];
  structured_data: StructuredDataItem[];
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_card: string;
  twitter_title: string;
  meta_keywords: string;
  h2s: string[];
  // Performance analysis fields
  css_count: number;
  js_count: number;
  inline_css_count: number;
  inline_js_count: number;
  total_resource_size: number;
  dom_depth: number;
  text_ratio: number;
  has_viewport_meta: boolean;
  has_charset: boolean;
  has_doctype: boolean;
  // Phase 1: Redirect chains, headers, hashing, pagination
  redirect_chain: RedirectHop[];
  content_hash: string;
  response_headers: [string, string][];
  meta_refresh: string;
  rel_next: string;
  rel_prev: string;
  // Phase 2: Robots & Sitemaps
  robots_blocked: boolean;
  in_sitemap: boolean;
  // Phase 3: Anchor text + inlinks
  outlinks: LinkInfo[];
  // Phase 4: Security analysis
  has_hsts: boolean;
  has_csp: boolean;
  has_x_frame_options: boolean;
  has_x_content_type_options: boolean;
  mixed_content_count: number;
  insecure_form_count: number;
  // Audit: multiple tag detection
  title_count: number;
  h1_count: number;
  h1_all: string[];
  meta_description_count: number;
  lang_attribute: string;
  raw_html: string;
  rendered_html: string;
}

export interface LinkInfo {
  source_url: string;
  target_url: string;
  anchor_text: string;
  rel: string;
  is_internal: boolean;
  link_type: string;
}

export interface CrawlStats {
  urls_crawled: number;
  urls_queued: number;
  urls_total: number;
  status_2xx: number;
  status_3xx: number;
  status_4xx: number;
  status_5xx: number;
  avg_response_ms: number;
  is_running: boolean;
  elapsed_seconds: number;
}

// ── Snapshots & Comparison ──
export interface SnapshotMeta {
  id: string;
  name: string;
  domain: string;
  url_count: number;
  created_at: string;
  status_2xx: number;
  status_3xx: number;
  status_4xx: number;
  status_5xx: number;
  avg_response_ms: number;
  indexable_count: number;
  non_indexable_count: number;
  total_word_count: number;
  size_bytes: number;
}

export interface UrlDiff {
  url: string;
  field: string;
  old_value: string;
  new_value: string;
}

export interface CrawlComparison {
  added_urls: string[];
  removed_urls: string[];
  changed: UrlDiff[];
}

export interface StorageConfig {
  custom_path: string;
  retention_days: number;
  max_snapshots: number;
  auto_save: boolean;
}

export interface StorageStats {
  total_snapshots: number;
  total_size_bytes: number;
  storage_path: string;
  oldest_snapshot: string;
  newest_snapshot: string;
  domains: DomainStats[];
}

export interface DomainStats {
  domain: string;
  snapshot_count: number;
  latest_crawl: string;
  total_size_bytes: number;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  custom_path: "",
  retention_days: 0,
  max_snapshots: 0,
  auto_save: false,
};

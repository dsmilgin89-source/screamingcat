export type IssueSeverity = "error" | "warning" | "opportunity";
export type IssuePriority = "critical" | "high" | "medium" | "low";

export type IssueCategory =
  | "response_codes"
  | "security"
  | "url"
  | "page_titles"
  | "meta_description"
  | "h1"
  | "h2"
  | "content"
  | "images"
  | "canonicals"
  | "directives"
  | "links"
  | "structured_data"
  | "social"
  | "performance"
  | "international";

export interface IssueDefinition {
  id: string;
  name: string;
  category: IssueCategory;
  severity: IssueSeverity;
  priority: IssuePriority;
  description: string;
  recommendation?: string;
}

export interface DetectedIssue {
  definition: IssueDefinition;
  urls: string[];
}

export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  response_codes: "Response Codes",
  security: "Security",
  url: "URL",
  page_titles: "Page Titles",
  meta_description: "Meta Description",
  h1: "H1",
  h2: "H2",
  content: "Content",
  images: "Images",
  canonicals: "Canonicals",
  directives: "Directives",
  links: "Links",
  structured_data: "Structured Data",
  social: "Social",
  performance: "Performance",
  international: "International",
};

export const SEVERITY_CONFIG: Record<
  IssueSeverity,
  { label: string; color: string; bgColor: string; order: number }
> = {
  error: {
    label: "Errors",
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    order: 0,
  },
  warning: {
    label: "Warnings",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10 border-yellow-500/20",
    order: 1,
  },
  opportunity: {
    label: "Opportunities",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    order: 2,
  },
};

export const PRIORITY_CONFIG: Record<
  IssuePriority,
  { label: string; color: string; order: number }
> = {
  critical: { label: "Critical", color: "text-red-400", order: 0 },
  high: { label: "High", color: "text-orange-400", order: 1 },
  medium: { label: "Medium", color: "text-yellow-400", order: 2 },
  low: { label: "Low", color: "text-gray-400", order: 3 },
};

// ── All issue definitions ──

export const ISSUE_DEFINITIONS: IssueDefinition[] = [
  // ── Response Codes ──
  {
    id: "no_response",
    name: "Internal No Response",
    category: "response_codes",
    severity: "error",
    priority: "critical",
    description: "URLs that failed to respond or returned a connection error during the crawl.",
  },
  {
    id: "client_error_4xx",
    name: "Client Error (4XX)",
    category: "response_codes",
    severity: "error",
    priority: "critical",
    description: "Pages returning a 4XX status code, indicating the resource was not found or access is forbidden.",
  },
  {
    id: "server_error_5xx",
    name: "Server Error (5XX)",
    category: "response_codes",
    severity: "error",
    priority: "critical",
    description: "Pages returning a 5XX status code, indicating a server-side error.",
  },
  {
    id: "redirect_3xx",
    name: "Internal Redirection (3XX)",
    category: "response_codes",
    severity: "warning",
    priority: "low",
    description: "URLs that redirect to another location. Consider updating links to point directly to the target.",
  },
  {
    id: "redirect_loop",
    name: "Redirect Loop",
    category: "response_codes",
    severity: "error",
    priority: "critical",
    description: "Redirect loop detected",
    recommendation: "Fix the redirect chain to eliminate the loop",
  },
  {
    id: "long_redirect_chain",
    name: "Long Redirect Chain",
    category: "response_codes",
    severity: "warning",
    priority: "medium",
    description: "Redirect chain exceeds 2 hops",
    recommendation: "Reduce redirect chain to at most 2 hops",
  },

  // ── Security ──
  {
    id: "http_url",
    name: "HTTP URLs (Not Secure)",
    category: "security",
    severity: "error",
    priority: "high",
    description: "Pages served over HTTP instead of HTTPS. All pages should use HTTPS for security.",
  },
  {
    id: "mixed_content_link",
    name: "HTTPS Pages Linking to HTTP",
    category: "security",
    severity: "warning",
    priority: "medium",
    description: "Secure pages that contain links to insecure HTTP URLs.",
  },
  {
    id: "missing_hsts",
    name: "Missing HSTS Header",
    category: "security",
    severity: "warning",
    priority: "medium",
    description: "Missing Strict-Transport-Security header",
  },
  {
    id: "missing_csp",
    name: "Missing CSP Header",
    category: "security",
    severity: "opportunity",
    priority: "low",
    description: "Missing Content-Security-Policy header",
  },
  {
    id: "mixed_content",
    name: "Mixed Content",
    category: "security",
    severity: "error",
    priority: "high",
    description: "HTTPS page loads HTTP resources (mixed content)",
  },
  {
    id: "insecure_form",
    name: "Insecure Form Action",
    category: "security",
    severity: "error",
    priority: "high",
    description: "Form action uses HTTP on HTTPS page",
  },

  // ── URL ──
  {
    id: "url_over_115_chars",
    name: "Over 115 Characters",
    category: "url",
    severity: "opportunity",
    priority: "low",
    description: "URLs longer than 115 characters. Shorter, descriptive URLs are preferred for SEO.",
  },
  {
    id: "url_contains_uppercase",
    name: "Uppercase Characters",
    category: "url",
    severity: "warning",
    priority: "low",
    description: "URLs containing uppercase letters. Lowercase URLs are a best practice to avoid duplicate content issues.",
  },
  {
    id: "url_contains_underscores",
    name: "Contains Underscores",
    category: "url",
    severity: "opportunity",
    priority: "low",
    description: "URLs using underscores instead of hyphens. Google recommends hyphens as word separators.",
  },
  {
    id: "url_has_parameters",
    name: "Contains Parameters",
    category: "url",
    severity: "warning",
    priority: "low",
    description: "URLs with query string parameters. Parameterized URLs can cause duplicate content issues.",
  },
  {
    id: "url_multiple_slashes",
    name: "Multiple Slashes in Path",
    category: "url",
    severity: "warning",
    priority: "low",
    description: "URLs with consecutive slashes (e.g. //path) which may indicate configuration issues.",
  },

  // ── Page Titles ──
  {
    id: "title_missing",
    name: "Missing",
    category: "page_titles",
    severity: "error",
    priority: "high",
    description: "Pages without a <title> tag. Every indexable page should have a unique, descriptive title.",
  },
  {
    id: "title_duplicate",
    name: "Duplicate",
    category: "page_titles",
    severity: "opportunity",
    priority: "medium",
    description: "Pages with identical title tags. Each page should have a unique title.",
  },
  {
    id: "title_over_60",
    name: "Over 60 Characters",
    category: "page_titles",
    severity: "opportunity",
    priority: "medium",
    description: "Titles exceeding 60 characters may be truncated in search results.",
  },
  {
    id: "title_below_30",
    name: "Below 30 Characters",
    category: "page_titles",
    severity: "opportunity",
    priority: "medium",
    description: "Titles under 30 characters may not be descriptive enough for search engines and users.",
  },
  {
    id: "title_same_as_h1",
    name: "Same as H1",
    category: "page_titles",
    severity: "opportunity",
    priority: "low",
    description: "Pages where the title tag is identical to the H1 heading. Consider differentiating them.",
  },

  // ── Meta Description ──
  {
    id: "meta_desc_missing",
    name: "Missing",
    category: "meta_description",
    severity: "opportunity",
    priority: "medium",
    description: "Pages without a meta description. While not a ranking factor, descriptions influence click-through rates.",
  },
  {
    id: "meta_desc_duplicate",
    name: "Duplicate",
    category: "meta_description",
    severity: "opportunity",
    priority: "low",
    description: "Pages with identical meta descriptions. Each page should have a unique description.",
  },
  {
    id: "meta_desc_over_155",
    name: "Over 155 Characters",
    category: "meta_description",
    severity: "opportunity",
    priority: "low",
    description: "Meta descriptions exceeding 155 characters may be truncated in search results.",
  },
  {
    id: "meta_desc_below_70",
    name: "Below 70 Characters",
    category: "meta_description",
    severity: "opportunity",
    priority: "low",
    description: "Meta descriptions under 70 characters may not provide enough context for users.",
  },

  // ── H1 ──
  {
    id: "h1_missing",
    name: "Missing",
    category: "h1",
    severity: "error",
    priority: "medium",
    description: "Pages without an H1 heading. Every page should have a clear primary heading.",
  },
  {
    id: "h1_duplicate",
    name: "Duplicate",
    category: "h1",
    severity: "opportunity",
    priority: "low",
    description: "Pages with identical H1 headings across different URLs.",
  },
  {
    id: "h1_over_70",
    name: "Over 70 Characters",
    category: "h1",
    severity: "opportunity",
    priority: "low",
    description: "H1 headings exceeding 70 characters. Keep headings concise and descriptive.",
  },

  // ── H2 ──
  {
    id: "h2_missing",
    name: "Missing",
    category: "h2",
    severity: "warning",
    priority: "low",
    description: "Pages without any H2 subheadings. Well-structured content uses heading hierarchy.",
  },

  // ── Content ──
  {
    id: "low_content",
    name: "Low Content Pages",
    category: "content",
    severity: "opportunity",
    priority: "medium",
    description: "Pages with very low word count (thin content). These may not provide enough value to rank.",
  },
  {
    id: "duplicate_content",
    name: "Duplicate Content",
    category: "content",
    severity: "warning",
    priority: "high",
    description: "Exact duplicate content detected (same MD5 hash)",
    recommendation: "Consolidate duplicate pages using canonical tags or redirects",
  },

  // ── Canonicals ──
  {
    id: "canonical_missing",
    name: "Missing",
    category: "canonicals",
    severity: "warning",
    priority: "medium",
    description: "Indexable pages without a canonical tag. Self-referencing canonicals are a best practice.",
  },
  {
    id: "canonical_points_elsewhere",
    name: "Canonicalised",
    category: "canonicals",
    severity: "warning",
    priority: "high",
    description: "Pages with a canonical tag pointing to a different URL, indicating they are not the preferred version.",
  },

  // ── Directives ──
  {
    id: "noindex",
    name: "Noindex",
    category: "directives",
    severity: "warning",
    priority: "high",
    description: "Pages with a noindex directive. These pages will not appear in search results.",
  },
  {
    id: "nofollow",
    name: "Nofollow",
    category: "directives",
    severity: "warning",
    priority: "high",
    description: "Pages with a nofollow directive. Links on these pages will not pass ranking signals.",
  },
  {
    id: "meta_refresh_redirect",
    name: "Meta Refresh Redirect",
    category: "directives",
    severity: "warning",
    priority: "medium",
    description: "Meta refresh redirect detected",
    recommendation: "Use server-side 301 redirects instead of meta refresh",
  },
  {
    id: "blocked_by_robots",
    name: "Blocked by Robots.txt",
    category: "directives",
    severity: "warning",
    priority: "medium",
    description: "URL blocked by robots.txt",
  },
  {
    id: "in_sitemap_not_indexable",
    name: "In Sitemap but Not Indexable",
    category: "directives",
    severity: "warning",
    priority: "high",
    description: "URL in sitemap but not indexable (noindex, 4xx, 5xx, or robots blocked)",
  },

  // ── Links ──
  {
    id: "no_internal_outlinks",
    name: "No Internal Outlinks",
    category: "links",
    severity: "warning",
    priority: "high",
    description: "Pages without any internal outgoing links. These may be dead-end pages for crawlers.",
  },
  {
    id: "high_external_outlinks",
    name: "High External Outlinks",
    category: "links",
    severity: "warning",
    priority: "low",
    description: "Pages with an unusually high number of external links (>100), which may dilute link equity.",
  },
  {
    id: "high_crawl_depth",
    name: "High Crawl Depth",
    category: "links",
    severity: "opportunity",
    priority: "medium",
    description: "Pages that are more than 3 clicks from the start URL. Important pages should be easily accessible.",
  },
  {
    id: "generic_anchor_text",
    name: "Generic Anchor Text",
    category: "links",
    severity: "opportunity",
    priority: "low",
    description: "Uses generic anchor text like 'click here' or 'read more'",
    recommendation: "Replace generic anchor text with descriptive text that conveys the topic of the linked page",
  },
  {
    id: "no_inlinks",
    name: "No Inlinks (Orphan Page)",
    category: "links",
    severity: "warning",
    priority: "medium",
    description: "Page has no internal pages linking to it",
    recommendation: "Add internal links from relevant pages to improve discoverability and crawlability",
  },
  {
    id: "orphan_page",
    name: "Orphan Page (In Sitemap, No Inlinks)",
    category: "links",
    severity: "warning",
    priority: "high",
    description: "Page is present in the XML sitemap but has no internal pages linking to it. These orphan pages are difficult for search engines to discover through crawling.",
    recommendation: "Add internal links from relevant pages, or remove from sitemap if the page is no longer needed",
  },
  {
    id: "slow_response",
    name: "Slow Response Time (>1s)",
    category: "response_codes",
    severity: "warning",
    priority: "medium",
    description: "Pages taking over 1 second to respond. Fast load times improve user experience and rankings.",
  },
  {
    id: "very_slow_response",
    name: "Very Slow Response Time (>3s)",
    category: "response_codes",
    severity: "error",
    priority: "high",
    description: "Pages taking over 3 seconds to respond. This significantly impacts user experience.",
  },
  {
    id: "large_page_size",
    name: "Large Page Size (>1MB)",
    category: "content",
    severity: "warning",
    priority: "medium",
    description: "Pages over 1MB in size. Large pages lead to slower load times, especially on mobile.",
  },
  {
    id: "non_indexable",
    name: "Non-Indexable Pages",
    category: "directives",
    severity: "warning",
    priority: "medium",
    description: "Pages that are non-indexable due to noindex, canonical, or other directives.",
  },

  // ── Images ──
  {
    id: "images_missing_alt",
    name: "Images Missing Alt Text",
    category: "images",
    severity: "warning",
    priority: "medium",
    description: "Page contains images without alt text, which impacts accessibility and image SEO.",
  },

  // ── Structured Data ──
  {
    id: "no_structured_data",
    name: "No Structured Data",
    category: "structured_data",
    severity: "opportunity",
    priority: "low",
    description: "Page has no JSON-LD structured data. Adding schema markup can improve search visibility with rich results.",
  },
  {
    id: "structured_data_errors",
    name: "Structured Data Validation Errors",
    category: "structured_data",
    severity: "warning",
    priority: "medium",
    description: "Structured data has validation errors",
  },

  // ── Social ──
  {
    id: "missing_open_graph",
    name: "Missing Open Graph Tags",
    category: "social",
    severity: "opportunity",
    priority: "low",
    description: "Page is missing Open Graph meta tags (og:title, og:description). These improve social media sharing appearance.",
  },

  // ── Performance ──
  {
    id: "too_many_js_files",
    name: "Too Many JS Files (>10)",
    category: "performance",
    severity: "warning",
    priority: "medium",
    description: "Page loads more than 10 external JavaScript files. Consider bundling or deferring scripts to improve load time.",
  },
  {
    id: "too_many_css_files",
    name: "Too Many CSS Files (>5)",
    category: "performance",
    severity: "warning",
    priority: "medium",
    description: "Page loads more than 5 external CSS files. Consider combining stylesheets to reduce HTTP requests.",
  },
  {
    id: "excessive_inline_js",
    name: "Excessive Inline JavaScript (>15)",
    category: "performance",
    severity: "warning",
    priority: "low",
    description: "Page contains more than 15 inline script blocks. Consider externalizing scripts for better caching.",
  },
  {
    id: "excessive_inline_css",
    name: "Excessive Inline CSS (>10)",
    category: "performance",
    severity: "opportunity",
    priority: "low",
    description: "Page contains more than 10 inline style blocks. Consider using external stylesheets for better caching.",
  },
  {
    id: "excessive_dom_depth",
    name: "Excessive DOM Depth (>32)",
    category: "performance",
    severity: "warning",
    priority: "medium",
    description: "Page has deeply nested DOM elements (over 32 levels). Deep DOM trees increase memory usage and slow rendering.",
  },
  {
    id: "low_text_ratio",
    name: "Low Text-to-HTML Ratio (<10%)",
    category: "performance",
    severity: "opportunity",
    priority: "low",
    description: "Page has a low text-to-HTML ratio, suggesting heavy markup relative to visible content. This can indicate bloated HTML.",
  },
  {
    id: "missing_viewport_meta",
    name: "Missing Viewport Meta Tag",
    category: "performance",
    severity: "error",
    priority: "high",
    description: "Page is missing the viewport meta tag. This is critical for mobile responsiveness and Core Web Vitals.",
  },
  {
    id: "missing_charset",
    name: "Missing Charset Declaration",
    category: "performance",
    severity: "warning",
    priority: "medium",
    description: "Page is missing a charset declaration (meta charset or Content-Type). This can cause rendering issues.",
  },
  {
    id: "missing_doctype",
    name: "Missing DOCTYPE Declaration",
    category: "performance",
    severity: "warning",
    priority: "medium",
    description: "Page is missing the <!DOCTYPE html> declaration. Without it, browsers render in quirks mode.",
  },
  {
    id: "high_total_resources",
    name: "Many Resources (>30 JS+CSS)",
    category: "performance",
    severity: "warning",
    priority: "medium",
    description: "Page loads more than 30 combined JS and CSS resources. This increases load time, especially on slow connections.",
  },

  // ── International ──
  {
    id: "hreflang_to_non_indexable",
    name: "Hreflang References Non-Indexable Page",
    category: "international",
    severity: "warning",
    priority: "high",
    description: "An hreflang tag points to a page that is not indexable (noindex, 4xx, or 5xx). Search engines may ignore this hreflang annotation.",
  },
  {
    id: "hreflang_missing_return_tag",
    name: "Hreflang Missing Return Tag",
    category: "international",
    severity: "warning",
    priority: "high",
    description: "This page has hreflang annotations, but the target page does not link back. Hreflang requires reciprocal tags to work correctly.",
  },

  // ── Canonicals (cross-page) ──
  {
    id: "canonical_to_non_indexable",
    name: "Canonical Points to Non-Indexable Page",
    category: "canonicals",
    severity: "warning",
    priority: "high",
    description: "The canonical URL points to a page that is not indexable (noindex, 4xx, or 5xx). This may cause search engines to ignore the canonical tag.",
  },
  {
    id: "canonical_chain",
    name: "Canonical Chain Detected",
    category: "canonicals",
    severity: "warning",
    priority: "medium",
    description: "The canonical URL points to a page whose own canonical is different (a chain). Search engines may not follow canonical chains.",
  },

  // ── Links (broken) ──
  {
    id: "broken_internal_link",
    name: "Page Links to Broken Internal URL",
    category: "links",
    severity: "error",
    priority: "critical",
    description: "This page contains an internal link to a URL that returns a 4xx or 5xx status code.",
  },
  {
    id: "broken_external_link",
    name: "Page Links to Broken External URL",
    category: "links",
    severity: "warning",
    priority: "medium",
    description: "This page contains an external link to a URL that returns a 4xx or 5xx status code.",
  },

  // ── Audit: multiple tags & missing attributes ──
  {
    id: "multiple_title_tags",
    name: "Multiple Title Tags",
    category: "page_titles",
    severity: "error",
    priority: "high",
    description: "This page has more than one <title> tag. Only the first is used by search engines; remove duplicates.",
  },
  {
    id: "multiple_h1_tags",
    name: "Multiple H1 Tags",
    category: "h1",
    severity: "warning",
    priority: "medium",
    description: "This page has more than one H1 heading. While not always harmful, a single H1 is best practice for clear page hierarchy.",
  },
  {
    id: "multiple_meta_descriptions",
    name: "Multiple Meta Descriptions",
    category: "meta_description",
    severity: "warning",
    priority: "medium",
    description: "This page has more than one meta description tag. Only the first is used; remove duplicates.",
  },
  {
    id: "missing_html_lang",
    name: "Missing HTML Lang Attribute",
    category: "international",
    severity: "warning",
    priority: "medium",
    description: "The <html> tag is missing a lang attribute. This helps search engines and screen readers understand the page language.",
  },
  {
    id: "hreflang_missing_x_default",
    name: "Hreflang Missing x-default",
    category: "international",
    severity: "warning",
    priority: "medium",
    description: "This page has hreflang annotations but no x-default value. The x-default tells search engines which URL to show for unsupported languages.",
  },
  {
    id: "nofollow_internal_link",
    name: "Internal Link with Nofollow",
    category: "links",
    severity: "warning",
    priority: "medium",
    description: "This page has internal links with rel='nofollow', which wastes crawl budget and prevents link equity flow within your site.",
  },
  {
    id: "article_missing_author",
    name: "Article Schema Missing Author",
    category: "structured_data",
    severity: "warning",
    priority: "high",
    description: "This page has Article/NewsArticle/BlogPosting schema but is missing the 'author' property. Author information is important for E-E-A-T and AI snippet eligibility.",
  },
  {
    id: "article_missing_date",
    name: "Article Schema Missing datePublished",
    category: "structured_data",
    severity: "warning",
    priority: "high",
    description: "This page has Article/NewsArticle/BlogPosting schema but is missing the 'datePublished' property. Dates are critical for content freshness signals.",
  },
];

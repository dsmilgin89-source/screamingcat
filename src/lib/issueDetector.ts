import type { CrawlResult } from "@/types/crawl";
import type { DetectedIssue, IssueDefinition } from "@/types/issues";
import { ISSUE_DEFINITIONS } from "@/types/issues";
import { buildInlinksMap, getInlinksCount, isGenericAnchorText } from "@/lib/linkGraph";

function getDefinition(id: string): IssueDefinition {
  return ISSUE_DEFINITIONS.find((d) => d.id === id)!;
}

function isHtmlPage(r: CrawlResult): boolean {
  return r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300;
}

/**
 * Analyze all crawl results and detect SEO issues.
 * Returns a list of detected issues, each with the affected URLs.
 */
export function detectIssues(results: CrawlResult[]): DetectedIssue[] {
  const issueMap = new Map<string, string[]>();

  const add = (id: string, url: string) => {
    if (!issueMap.has(id)) issueMap.set(id, []);
    issueMap.get(id)!.push(url);
  };

  // Pre-compute inlinks map for orphan page detection
  const inlinksMap = buildInlinksMap(results);

  // Pre-compute duplicate lookups
  const titleCount = new Map<string, string[]>();
  const descCount = new Map<string, string[]>();
  const h1Count = new Map<string, string[]>();
  const contentHashCount = new Map<string, string[]>();

  for (const r of results) {
    if (isHtmlPage(r) && r.title) {
      const key = r.title.toLowerCase().trim();
      if (!titleCount.has(key)) titleCount.set(key, []);
      titleCount.get(key)!.push(r.url);
    }
    if (isHtmlPage(r) && r.meta_description) {
      const key = r.meta_description.toLowerCase().trim();
      if (!descCount.has(key)) descCount.set(key, []);
      descCount.get(key)!.push(r.url);
    }
    if (isHtmlPage(r) && r.h1) {
      const key = r.h1.toLowerCase().trim();
      if (!h1Count.has(key)) h1Count.set(key, []);
      h1Count.get(key)!.push(r.url);
    }
    if (r.content_hash) {
      if (!contentHashCount.has(r.content_hash)) contentHashCount.set(r.content_hash, []);
      contentHashCount.get(r.content_hash)!.push(r.url);
    }
  }

  for (const r of results) {
    // ── Response Codes ──
    if (r.status_code === 0) {
      add("no_response", r.url);
    }
    if (r.status_code >= 400 && r.status_code < 500) {
      add("client_error_4xx", r.url);
    }
    if (r.status_code >= 500) {
      add("server_error_5xx", r.url);
    }
    if (r.status_code >= 300 && r.status_code < 400) {
      add("redirect_3xx", r.url);
    }
    if (r.response_time_ms > 3000) {
      add("very_slow_response", r.url);
    } else if (r.response_time_ms > 1000) {
      add("slow_response", r.url);
    }

    // ── Redirect chains ──
    if (r.redirect_chain && r.redirect_chain.length > 0) {
      const hasLoopMarker = r.redirect_chain.some((hop) => hop.status_code === 0);
      const chainUrls = r.redirect_chain.map((hop) => hop.url);
      const hasDuplicateUrl = new Set(chainUrls).size !== chainUrls.length;
      if (hasLoopMarker || hasDuplicateUrl) {
        add("redirect_loop", r.url);
      }
      if (r.redirect_chain.length > 2) {
        add("long_redirect_chain", r.url);
      }
    }

    // ── Meta refresh redirect ──
    if (r.meta_refresh) {
      add("meta_refresh_redirect", r.url);
    }

    // ── Robots.txt & Sitemaps ──
    if (r.robots_blocked === true) {
      add("blocked_by_robots", r.url);
    }
    if (r.in_sitemap === true && (!r.indexable || r.robots_blocked || r.status_code >= 400 || r.status_code === 0)) {
      add("in_sitemap_not_indexable", r.url);
    }

    // Only analyze HTML pages for on-page issues
    if (!isHtmlPage(r)) continue;

    // ── Security ──
    if (r.url.startsWith("http://")) {
      add("http_url", r.url);
    }
    if (!r.has_hsts && r.url.startsWith("https://")) {
      add("missing_hsts", r.url);
    }
    if (!r.has_csp) {
      add("missing_csp", r.url);
    }
    if ((r.mixed_content_count ?? 0) > 0) {
      add("mixed_content", r.url);
    }
    if ((r.insecure_form_count ?? 0) > 0) {
      add("insecure_form", r.url);
    }

    // ── URL ──
    try {
      const parsed = new URL(r.url);
      const path = parsed.pathname;

      if (r.url.length > 115) {
        add("url_over_115_chars", r.url);
      }
      if (/[A-Z]/.test(path)) {
        add("url_contains_uppercase", r.url);
      }
      if (path.includes("_")) {
        add("url_contains_underscores", r.url);
      }
      if (parsed.search) {
        add("url_has_parameters", r.url);
      }
      if (path.includes("//")) {
        add("url_multiple_slashes", r.url);
      }
    } catch {
      // skip invalid URLs
    }

    // ── Page Titles ──
    if (!r.title) {
      add("title_missing", r.url);
    } else {
      if (r.title.length > 60) {
        add("title_over_60", r.url);
      }
      if (r.title.length < 30 && r.title.length > 0) {
        add("title_below_30", r.url);
      }
      if (r.h1 && r.title.toLowerCase().trim() === r.h1.toLowerCase().trim()) {
        add("title_same_as_h1", r.url);
      }
    }

    // ── Meta Description ──
    if (!r.meta_description) {
      add("meta_desc_missing", r.url);
    } else {
      if (r.meta_description.length > 155) {
        add("meta_desc_over_155", r.url);
      }
      if (r.meta_description.length < 70 && r.meta_description.length > 0) {
        add("meta_desc_below_70", r.url);
      }
    }

    // ── H1 ──
    if (!r.h1) {
      add("h1_missing", r.url);
    } else {
      if (r.h1.length > 70) {
        add("h1_over_70", r.url);
      }
    }

    // ── H2 ──
    if (r.h2_count === 0) {
      add("h2_missing", r.url);
    }

    // ── Content ──
    if (r.word_count < 200 && r.word_count > 0) {
      add("low_content", r.url);
    }
    if (r.content_length > 1048576) {
      add("large_page_size", r.url);
    }

    // ── Canonicals ──
    if (!r.canonical) {
      add("canonical_missing", r.url);
    } else if (r.canonical !== r.url) {
      add("canonical_points_elsewhere", r.url);
    }

    // ── Directives ──
    const robots = r.robots_meta.toLowerCase();
    if (robots.includes("noindex")) {
      add("noindex", r.url);
    }
    if (robots.includes("nofollow")) {
      add("nofollow", r.url);
    }
    if (!r.indexable) {
      add("non_indexable", r.url);
    }

    // ── Links ──
    if (r.internal_links === 0) {
      add("no_internal_outlinks", r.url);
    }
    if (r.external_links > 100) {
      add("high_external_outlinks", r.url);
    }
    if (r.depth > 3) {
      add("high_crawl_depth", r.url);
    }

    // ── Anchor Text & Inlinks ──
    if (r.outlinks && r.outlinks.some((l) => l.anchor_text.trim() && isGenericAnchorText(l.anchor_text))) {
      add("generic_anchor_text", r.url);
    }
    if (r.depth > 0 && getInlinksCount(inlinksMap, r.url) === 0) {
      add("no_inlinks", r.url);
    }
    // Orphan page: in sitemap but no inlinks
    if (r.in_sitemap && r.depth > 0 && getInlinksCount(inlinksMap, r.url) === 0) {
      add("orphan_page", r.url);
    }

    // ── Multiple tags detection ──
    if (r.title_count > 1) add("multiple_title_tags", r.url);
    if (r.h1_count > 1) add("multiple_h1_tags", r.url);
    if (r.meta_description_count > 1) add("multiple_meta_descriptions", r.url);

    // ── Missing html lang ──
    if (isHtmlPage(r) && !r.lang_attribute) add("missing_html_lang", r.url);

    // ── Images ──
    if (r.images_missing_alt > 0) {
      add("images_missing_alt", r.url);
    }

    // ── Structured Data ──
    if (!r.structured_data_types || r.structured_data_types.length === 0) {
      add("no_structured_data", r.url);
    }
    if (r.structured_data?.some((s) => !s.is_valid)) {
      add("structured_data_errors", r.url);
    }

    // ── Open Graph ──
    if (!r.og_title && !r.og_description) {
      add("missing_open_graph", r.url);
    }

    // ── Performance ──
    if (r.js_count > 10) {
      add("too_many_js_files", r.url);
    }
    if (r.css_count > 5) {
      add("too_many_css_files", r.url);
    }
    if (r.inline_js_count > 15) {
      add("excessive_inline_js", r.url);
    }
    if (r.inline_css_count > 10) {
      add("excessive_inline_css", r.url);
    }
    if (r.dom_depth > 32) {
      add("excessive_dom_depth", r.url);
    }
    if (r.text_ratio > 0 && r.text_ratio < 10) {
      add("low_text_ratio", r.url);
    }
    if (!r.has_viewport_meta) {
      add("missing_viewport_meta", r.url);
    }
    if (!r.has_charset) {
      add("missing_charset", r.url);
    }
    if (!r.has_doctype) {
      add("missing_doctype", r.url);
    }
    if (r.js_count + r.css_count > 30) {
      add("high_total_resources", r.url);
    }
  }

  // ── Hreflang validation (post-processing) ──
  const urlToResult = new Map<string, CrawlResult>();
  for (const r of results) {
    urlToResult.set(r.url, r);
    // Also store without trailing slash for matching
    const normalized = r.url.replace(/\/+$/, "");
    if (normalized !== r.url) urlToResult.set(normalized, r);
  }

  for (const r of results) {
    if (!isHtmlPage(r) || !r.hreflang || r.hreflang.length === 0) continue;

    // Check for missing x-default
    if (r.hreflang.length > 0 && !r.hreflang.some((h) => h.lang === "x-default")) {
      add("hreflang_missing_x_default", r.url);
    }

    for (const entry of r.hreflang) {
      // Check if hreflang target is non-indexable
      const target = urlToResult.get(entry.url) || urlToResult.get(entry.url.replace(/\/+$/, ""));
      if (target && (!target.indexable || target.status_code >= 400)) {
        add("hreflang_to_non_indexable", r.url);
      }

      // Check for missing return tag
      if (target && target.hreflang) {
        const hasReturnTag = target.hreflang.some((h) => {
          const hUrl = h.url.replace(/\/+$/, "");
          const rUrl = r.url.replace(/\/+$/, "");
          return hUrl === rUrl || h.url === r.url;
        });
        if (!hasReturnTag) {
          add("hreflang_missing_return_tag", r.url);
        }
      }
    }
  }

  // ── Canonical validation (post-processing) ──
  for (const r of results) {
    if (!isHtmlPage(r) || !r.canonical || r.canonical === r.url) continue;

    const target = urlToResult.get(r.canonical) || urlToResult.get(r.canonical.replace(/\/+$/, ""));
    if (target) {
      if (!target.indexable || target.status_code >= 400) {
        add("canonical_to_non_indexable", r.url);
      }
      if (target.canonical && target.canonical !== r.canonical && target.canonical !== target.url) {
        add("canonical_chain", r.url);
      }
    }
  }

  // ── Broken link detection (post-processing) ──
  const brokenUrls = new Set<string>();
  for (const r of results) {
    if (r.status_code >= 400) brokenUrls.add(r.url);
  }
  for (const r of results) {
    if (!isHtmlPage(r) || !r.outlinks) continue;
    for (const link of r.outlinks) {
      if (brokenUrls.has(link.target_url)) {
        if (link.is_internal) {
          add("broken_internal_link", r.url);
        } else {
          add("broken_external_link", r.url);
        }
      }
    }
  }

  // ── Nofollow on internal links (post-processing) ──
  for (const r of results) {
    if (!isHtmlPage(r) || !r.outlinks) continue;
    for (const link of r.outlinks) {
      if (link.is_internal && link.rel && link.rel.includes("nofollow")) {
        add("nofollow_internal_link", r.url);
        break; // One per page is enough
      }
    }
  }

  // ── Article schema missing author/date (post-processing) ──
  for (const r of results) {
    if (!r.structured_data || r.structured_data.length === 0) continue;
    for (const sd of r.structured_data) {
      const articleTypes = ["Article", "NewsArticle", "BlogPosting", "TechArticle"];
      if (articleTypes.includes(sd.schema_type)) {
        if (sd.errors && sd.errors.some((e: string) => e.includes("author"))) {
          add("article_missing_author", r.url);
        }
        if (sd.errors && sd.errors.some((e: string) => e.includes("datePublished"))) {
          add("article_missing_date", r.url);
        }
      }
    }
  }

  // ── Duplicates (post-processing) ──
  for (const [, urls] of titleCount) {
    if (urls.length > 1) {
      for (const url of urls) add("title_duplicate", url);
    }
  }
  for (const [, urls] of descCount) {
    if (urls.length > 1) {
      for (const url of urls) add("meta_desc_duplicate", url);
    }
  }
  for (const [, urls] of h1Count) {
    if (urls.length > 1) {
      for (const url of urls) add("h1_duplicate", url);
    }
  }
  for (const [, urls] of contentHashCount) {
    if (urls.length > 1) {
      for (const url of urls) add("duplicate_content", url);
    }
  }

  // Build detected issues list (only issues that have affected URLs)
  const detected: DetectedIssue[] = [];
  for (const [id, urls] of issueMap) {
    const def = getDefinition(id);
    if (def) {
      // Deduplicate URLs
      const unique = [...new Set(urls)];
      detected.push({ definition: def, urls: unique });
    }
  }

  return detected;
}

/**
 * Summary counts for the overview
 */
export function issueSummary(issues: DetectedIssue[]) {
  let errors = 0;
  let warnings = 0;
  let opportunities = 0;
  let totalUrls = 0;

  for (const issue of issues) {
    const count = issue.urls.length;
    totalUrls += count;
    switch (issue.definition.severity) {
      case "error":
        errors += count;
        break;
      case "warning":
        warnings += count;
        break;
      case "opportunity":
        opportunities += count;
        break;
    }
  }

  return { errors, warnings, opportunities, totalUrls };
}

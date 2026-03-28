# Features Page — ScreamingCAT

## Meta
- **Page Title:** ScreamingCAT Features — Complete Technical SEO Crawler & Site Auditor
- **Meta Description:** Explore ScreamingCAT's full feature set: 60+ SEO checks, JavaScript rendering, Google integrations, custom extraction, site visualization, and more. Free and open-source.

---

## Hero Section

### Headline: A Full-Featured SEO Crawler. Zero Cost.

### Subheadline
ScreamingCAT gives you the same depth of analysis as premium crawlers — broken links, metadata audits, structured data validation, JavaScript rendering, and Google tool integrations — without a license fee.

### CTA
**Download ScreamingCAT** | View on GitHub

---

## Section 1: Crawling Engine

### Headline: Fast, Configurable, Multi-Threaded Crawling

ScreamingCAT's Rust-powered engine crawls websites concurrently with fine-grained control over every aspect of the crawl.

- **Multi-threaded crawling** — configurable thread count (default: 8 threads)
- **Crawl depth and URL limits** — set maximum depth, folder limits, and query string handling
- **Request throttling** — control max URLs per second to avoid overloading servers
- **Redirect chain tracking** — follow redirects and detect infinite loops
- **Content deduplication** — MD5 hashing flags identical pages automatically
- **URL filtering** — include/exclude patterns using regular expressions
- **User-Agent presets** — crawl as Googlebot (desktop or mobile), Bingbot, or any custom agent
- **Custom HTTP headers** — add authentication tokens or custom headers to every request
- **Robots.txt handling** — respect, ignore, or respect-and-report modes
- **Sitemap discovery** — parse XML sitemaps to find URLs beyond internal links

---

## Section 2: On-Page SEO Analysis

### Headline: 60+ Automated SEO Checks per URL

Every crawled page is analyzed across dozens of data points. Issues are categorized by type and severity, so you fix what matters first.

### Response & Server
- HTTP status codes (2xx, 3xx, 4xx, 5xx)
- Response time tracking
- Content type and page size
- Redirect chains and destinations

### Metadata & Content
- Page titles — missing, too short, too long, duplicates
- Meta descriptions — missing, too short, too long, duplicates
- H1 and H2 tags — missing, duplicate, multiple
- Word count and text-to-HTML ratio
- Meta robots directives (noindex, nofollow)
- Canonical tag validation — missing, self-referencing, pointing elsewhere, chains

### Links
- Internal and external link counts
- Broken link detection (4xx, 5xx responses)
- Orphan page identification
- Generic anchor text detection ("click here", "read more")
- Crawl depth analysis — pages too many clicks from the homepage

### Images
- Missing alt text detection
- Image crawling and resource analysis

### Structured Data
- JSON-LD extraction and validation
- Missing structured data warnings
- Schema validation errors

### International SEO
- Hreflang tag extraction and validation
- Missing return tag detection
- Hreflang pointing to non-indexable pages

### Social Tags
- Open Graph tag detection
- Twitter Card tag detection
- Missing social metadata warnings

---

## Section 3: Security Analysis

### Headline: Spot Security Issues That Affect SEO

Search engines factor security signals into rankings. ScreamingCAT flags common security gaps.

- **HTTPS usage** — detect HTTP pages and mixed content
- **HSTS headers** — missing Strict-Transport-Security
- **Content Security Policy** — missing CSP headers
- **X-Frame-Options** — clickjacking protection check
- **X-Content-Type-Options** — MIME sniffing protection
- **Insecure forms** — HTTP form actions on HTTPS pages

---

## Section 4: JavaScript Rendering

### Headline: See Your Pages the Way Google Sees Them

Many modern websites rely on JavaScript to load content. ScreamingCAT's built-in headless Chrome engine renders pages fully before analysis.

- Detect AJAX-loaded content invisible to text-only crawlers
- Analyze single-page applications (SPAs) and React/Vue/Angular sites
- Compare rendered vs. raw HTML output
- Toggle between text-only and JavaScript rendering modes

---

## Section 5: Google Integrations

### Headline: Enrich Crawl Data with Google's Own Metrics

Connect your Google accounts to pull real performance and search data directly into your crawl results. No third-party plugins.

**PageSpeed Insights**
- Lighthouse scores per URL
- Core Web Vitals: LCP, FCP, CLS, TTI, Speed Index
- Mobile and desktop strategies

**Google Search Console**
- Clicks, impressions, CTR, and average position per URL
- See which crawled pages actually drive organic traffic

**Google Analytics 4**
- Sessions, users, bounce rate, and conversions per page
- Connect crawl data to real user behavior

All integrations use OAuth 2.0 with automatic token refresh.

---

## Section 6: Custom Extraction & Search

### Headline: Extract Any Data from Any Page

Go beyond built-in metrics. Define custom extraction rules to pull specific data from crawled pages.

- **CSS selectors** — target any HTML element
- **XPath expressions** — precise path-based extraction
- **Regex patterns** — match and capture text patterns
- **Custom search** — find specific text or patterns across all crawled pages (contains or regex mode)

Results appear per URL in the main results table — exportable like any other column.

---

## Section 7: Data Visualization

### Headline: Understand Your Site Structure at a Glance

Three built-in visualization tools turn raw crawl data into actionable insight.

**Crawl Tree**
Visual hierarchy showing your site's folder and page structure. Spot deep or orphaned sections.

**Site Graph**
Network diagram of internal linking relationships. See how pages connect — and where link equity flows.

**Crawl Depth Chart**
Distribution of URLs by depth level. Identify pages buried too deep for search engines to find.

All visualizations support:
- Color-coding by indexability, status code, or content type
- Node sizing by crawl depth, internal links, or word count
- Multiple layout options (left-to-right, top-to-bottom)
- Right-click context menu for quick URL navigation

---

## Section 8: Export & Reporting

### Headline: Get Your Data Out in Any Format

- **CSV** — full crawl data with all metrics
- **Excel (XLSX)** — formatted spreadsheets ready for client reporting
- **XML Sitemap** — generate valid sitemaps from your crawl results
- **Project Files (.sccat)** — save entire crawls with integration data to revisit later

---

## Section 9: Crawl Comparison

### Headline: Track SEO Changes Over Time

Save crawl snapshots with custom names. Compare any two snapshots to detect:

- **Added URLs** — new pages since last crawl
- **Removed URLs** — pages that disappeared
- **Changed fields** — title, status code, description, canonical, and more

Use comparisons after site migrations, redesigns, or routine audits to verify nothing was broken.

---

## Final CTA

### Headline: Every Feature. No Paywall.

ScreamingCAT gives you the complete toolset for technical SEO — free, open-source, and built to perform.

**[Download for Free]** — Windows, macOS, Linux

**[View Full Documentation →]**

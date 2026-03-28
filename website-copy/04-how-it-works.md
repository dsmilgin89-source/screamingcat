# How It Works Page — ScreamingCAT

## Meta
- **Page Title:** How ScreamingCAT Works — Website Crawling & SEO Auditing Explained
- **Meta Description:** Learn how ScreamingCAT crawls websites, detects SEO issues, and delivers actionable reports. A step-by-step walkthrough of the free open-source SEO spider.

---

## Hero Section

### Headline: From URL to Full Site Audit in Minutes

### Subheadline
ScreamingCAT is a desktop application that crawls your website like a search engine would — following links, analyzing pages, and flagging issues. Here's how it works.

---

## Step 1: Configure Your Crawl

### Headline: Tell ScreamingCAT What to Crawl and How

Paste your starting URL and adjust settings to match your needs:

- **Crawl depth** — how many link levels deep to go
- **Speed controls** — number of threads and max requests per second
- **User-Agent** — crawl as Googlebot, Bingbot, a real browser, or a custom agent
- **URL filters** — include or exclude URL patterns using regex
- **Rendering mode** — text-only (fast) or JavaScript rendering (headless Chrome)
- **Robots.txt** — respect, ignore, or report-only mode
- **Authentication** — log into password-protected areas before crawling

You can also upload a URL list instead of crawling from a starting page.

---

## Step 2: Crawl and Extract

### Headline: ScreamingCAT Visits Every Page and Extracts the Data

Once you start the crawl, the multi-threaded Rust engine begins visiting pages concurrently. For each URL, it extracts:

- HTTP response code and response time
- Page title, meta description, H1, H2 tags
- Canonical URL and meta robots directives
- Word count, text ratio, and page size
- Internal and external link counts
- Images and missing alt text
- Structured data (JSON-LD) with validation
- Open Graph and Twitter Card tags
- Hreflang tags for international SEO
- Security headers (HSTS, CSP, X-Frame-Options)
- CSS, JavaScript, and inline resource counts

If JavaScript rendering is enabled, ScreamingCAT uses headless Chrome to fully render each page before extracting data — so you see what search engines see.

Real-time statistics update as the crawl progresses: URLs crawled, URLs queued, response code breakdown, and average response time.

---

## Step 3: Detect Issues Automatically

### Headline: 60+ Checks Run on Every URL

ScreamingCAT applies over 60 automated checks to every crawled page and categorizes issues by type and severity:

**Critical issues** — broken pages (4xx, 5xx), server errors, no response
**Warnings** — missing titles, duplicate meta descriptions, redirect chains
**Notices** — generic anchor text, excessive DOM depth, low text ratio

Issues are grouped into categories:
- Response Codes
- Security
- URL Structure
- Titles & Descriptions
- Headings
- Content Quality
- Canonicals & Directives
- Links & Navigation
- Structured Data
- Images
- Social Tags
- Performance
- International SEO

---

## Step 4: Enrich with Google Data (Optional)

### Headline: Connect Google Tools for Real-World Metrics

Optionally connect your Google accounts to layer real performance data onto crawl results:

- **PageSpeed Insights** — Lighthouse scores and Core Web Vitals (LCP, FCP, CLS) for each URL
- **Google Search Console** — clicks, impressions, CTR, and average position
- **Google Analytics 4** — sessions, users, bounce rate, and conversions

This lets you prioritize fixes based on actual traffic impact, not just technical severity.

---

## Step 5: Analyze and Visualize

### Headline: Browse Results, Filter Issues, and See the Big Picture

**Results Table**
A fast, virtualized table displaying all crawled URLs with every data point. Sort, filter, and search across columns. Click any URL for a detailed breakdown.

**Issues Panel**
See all detected issues in one view. Filter by severity or category. Each issue links to the affected URLs.

**Site Visualizations**
- Crawl Tree — hierarchical view of site structure
- Site Graph — internal linking network diagram
- Crawl Depth Chart — distribution of URLs by depth level

---

## Step 6: Export and Compare

### Headline: Get Your Data Out. Track Changes Over Time.

**Export formats:**
- CSV with all metrics
- Excel (XLSX) with formatted columns
- XML sitemap generated from crawl results

**Snapshot comparison:**
Save crawl snapshots at any point. Compare two snapshots to see added URLs, removed URLs, and changed metadata. Use this after migrations, redesigns, or content updates.

**Project files:**
Save your entire crawl as a .sccat project file — including integration data — and reopen it later.

---

## Final CTA

### Headline: See It for Yourself

Download ScreamingCAT and run your first crawl. No account needed. No limits.

**[Download for Free]** — Windows, macOS, Linux

**[Read the Documentation →]**

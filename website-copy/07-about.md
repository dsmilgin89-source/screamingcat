# About Page — ScreamingCAT

## Meta
- **Page Title:** About ScreamingCAT — The Story Behind the Free SEO Crawler
- **Meta Description:** Learn why ScreamingCAT was built — an open-source alternative to paid SEO crawlers, created to make professional-grade site auditing accessible to everyone.

---

## Hero Section

### Headline: Built Because SEO Tools Shouldn't Cost a Fortune

### Subheadline
ScreamingCAT is an open-source website crawler and technical SEO auditor built for professionals who want powerful tools without the price tag.

---

## The Problem We Saw

### Headline: Good SEO Tools Are Expensive. They Don't Have to Be.

Technical SEO crawlers are essential for anyone who manages a website. They find broken links, missing metadata, security gaps, and structural problems that hurt search visibility.

But the best desktop crawlers lock critical features — JavaScript rendering, Google integrations, unlimited crawling — behind annual licenses that cost hundreds of dollars. For freelancers, small agencies, and developers, that adds up fast.

We thought the core functionality of a website crawler shouldn't be gated by price. So we built one that isn't.

---

## What We Built

### Headline: A Professional SEO Crawler. Open Source. Free.

ScreamingCAT is a desktop application that crawls websites the way search engines do — following links, extracting metadata, analyzing content, and detecting issues.

It runs natively on Windows, macOS, and Linux with a lightweight footprint. Built with **Rust** for backend performance and **React** for a modern interface, wrapped in **Tauri** for cross-platform desktop delivery.

The result: a fast, capable crawler that handles sites of any size — from a 50-page portfolio to a 100,000-page e-commerce store — without cloud dependencies or recurring fees.

---

## Our Principles

**Free means free**
No freemium model. No feature gates. No "upgrade to unlock." Every capability is available to every user from day one.

**Your data stays yours**
ScreamingCAT runs on your machine. Crawl data is stored locally. Nothing is sent to external servers unless you explicitly connect Google integrations with your own credentials.

**Open source, open development**
The source code is publicly available. Bug reports, feature requests, and contributions are welcome. Transparency builds trust — and better software.

**Performance over bloat**
Rust was chosen for the crawling engine because speed and memory efficiency matter when processing thousands of URLs. Tauri was chosen over Electron to keep the application lightweight.

---

## The Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Crawling engine | Rust + Tokio | Async, multi-threaded, memory-safe |
| HTML parsing | scraper (Rust) | Fast CSS selector-based extraction |
| JS rendering | headless_chrome | Full page rendering for SPAs |
| Database | SQLite (rusqlite) | Local storage, zero config |
| Frontend | React 19 + TypeScript | Modern, type-safe UI |
| Styling | TailwindCSS | Consistent, maintainable design |
| Desktop wrapper | Tauri 2 | Native feel, small binary, cross-platform |
| Data tables | TanStack Table + React Virtual | Handles 100K+ rows smoothly |

---

## Contributing

ScreamingCAT is an open-source project. There are several ways to get involved:

- **Report bugs** — found something broken? Open an issue on GitHub
- **Request features** — tell us what you need via GitHub issues
- **Submit code** — pull requests are welcome for bug fixes, features, and improvements
- **Spread the word** — tell your SEO friends about a free alternative

**[View the project on GitHub →]**

---

## Final CTA

### Headline: Try It. It's Free.

Download ScreamingCAT and run your first site audit today.

**[Download for Free]** — Windows, macOS, Linux

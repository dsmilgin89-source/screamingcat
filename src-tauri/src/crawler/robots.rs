use reqwest::Client;
use robotstxt::matcher::{LongestMatchRobotsMatchStrategy, RobotsMatcher};
use url::Url;

/// Parsed robots.txt for a domain, with cached sitemap URLs
pub struct RobotsChecker {
    raw_text: String,
    pub sitemaps: Vec<String>,
}

impl RobotsChecker {
    /// Fetch and parse robots.txt from the given base URL
    pub async fn fetch(_client: &Client, base_url: &Url) -> Option<Self> {
        let robots_url = format!(
            "{}://{}/robots.txt",
            base_url.scheme(),
            base_url.host_str().unwrap_or_default()
        );

        // Use a simple client that follows redirects for robots.txt (the
        // crawler client uses redirect(Policy::none()) which would miss
        // http→https redirects on robots.txt).
        let robots_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .ok()?;
        let response = robots_client.get(&robots_url).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }

        let raw_text = response.text().await.ok()?;

        // Extract Sitemap directives manually (robotstxt crate doesn't expose them)
        let sitemaps = raw_text
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed.to_lowercase().starts_with("sitemap:") {
                    Some(trimmed[8..].trim().to_string())
                } else {
                    None
                }
            })
            .filter(|url| !url.is_empty())
            .collect();

        Some(Self { raw_text, sitemaps })
    }

    /// Check if a URL is allowed by robots.txt for the given user-agent
    pub fn is_allowed(&self, url: &str, user_agent: &str) -> bool {
        let mut matcher = RobotsMatcher::<LongestMatchRobotsMatchStrategy>::default();
        matcher.one_agent_allowed_by_robots(&self.raw_text, user_agent, url)
    }
}

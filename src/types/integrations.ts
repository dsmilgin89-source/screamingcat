// ── PageSpeed Insights ──

export interface PageSpeedResult {
  url: string;
  performance_score: number;
  accessibility_score: number;
  best_practices_score: number;
  seo_score: number;
  fcp_ms: number;
  lcp_ms: number;
  tbt_ms: number;
  cls: number;
  speed_index_ms: number;
  tti_ms: number;
  error: string;
  analyzed: boolean;
}

// ── Google Search Console ──

export interface GscPageData {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryData {
  query: string;
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// ── Google Analytics ──

export interface GaPageData {
  url: string;
  sessions: number;
  users: number;
  page_views: number;
  avg_engagement_time: number;
  bounce_rate: number;
  conversions: number;
}

// ── Google OAuth Tokens ──

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  token_type: string;
  obtained_at: number;
}

// ── Helper ──

export function isTokenExpired(tokens: GoogleTokens): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= tokens.obtained_at + tokens.expires_in - 60;
}

// ── Integration Config (stored in localStorage) ──

export interface IntegrationConfig {
  // PageSpeed Insights
  psi_api_key: string;
  psi_strategy: "mobile" | "desktop";

  // Google OAuth credentials
  google_client_id: string;
  google_client_secret: string;

  // GSC
  gsc_site_url: string;
  gsc_tokens: GoogleTokens | null;

  // GA4
  ga_property_id: string;
  ga_tokens: GoogleTokens | null;
}

export const defaultIntegrationConfig: IntegrationConfig = {
  psi_api_key: "",
  psi_strategy: "mobile",
  google_client_id: "",
  google_client_secret: "",
  gsc_site_url: "",
  gsc_tokens: null,
  ga_property_id: "",
  ga_tokens: null,
};

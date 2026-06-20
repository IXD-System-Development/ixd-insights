/**
 * IXD Systems Dashboard — Configuration
 * ═══════════════════════════════════════
 * Central config for the static dashboard.
 * Edit DATA_BASE_URL for local dev vs GitHub Pages.
 */

const CONFIG = {
  // For GitHub Pages deployment:
  // DATA_BASE_URL: 'https://raw.githubusercontent.com/ixd-system-development/ixd-insights/main/data',
  
  // For local development (relative path):
  DATA_BASE_URL: 'data',

  SITES_FILE: 'sites.json',

  // Refresh intervals (ms)
  OVERVIEW_REFRESH_MS: 60000,   // 60s for overview
  DETAIL_REFRESH_MS: 30000,     // 30s for site detail

  // Staleness thresholds (seconds)
  LIVE_THRESHOLD_S: 60,
  WARN_THRESHOLD_S: 300,

  // Rate limit pause (ms)
  RATE_LIMIT_PAUSE_MS: 60000,
};

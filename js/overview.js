/**
 * IXD Systems Dashboard — Overview Page Logic
 * ════════════════════════════════════════════════
 * Renders the multi-site grid with filtering, auto-refresh, and visibility detection.
 */

const Overview = (() => {
  let _refreshTimer = null;
  let _currentRegion = 'all';
  let _healthData = {};

  async function init() {
    try {
      await DataLayer.loadSites();
    } catch (e) {
      document.getElementById('sites-grid').innerHTML =
        '<div class="error-banner">⚠ Unable to load site configuration. Check network connection.</div>';
      return;
    }

    _currentRegion = getRegionFromURL();
    renderFilterBar();
    await refresh();
    startAutoRefresh();
    setupVisibilityPause();
  }

  function getRegionFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('region') || 'all';
  }

  function setRegionInURL(region) {
    const url = new URL(window.location);
    if (region === 'all') {
      url.searchParams.delete('region');
    } else {
      url.searchParams.set('region', region);
    }
    window.history.replaceState({}, '', url);
  }

  function renderFilterBar() {
    // Region filters removed — show all sites
  }

  async function refresh() {
    if (DataLayer.isRateLimited()) {
      showRateLimitWarning();
      return;
    }
    _healthData = await DataLayer.fetchAllSiteHealth();
    hideWarnings();
    checkForErrors();
    renderGrid();
    updateNavStatus();
  }

  function renderGrid() {
    const sites = DataLayer.getSites();
    const container = document.getElementById('sites-grid');
    if (!container) return;

    const filtered = _currentRegion === 'all'
      ? sites
      : sites.filter(s => s.region === _currentRegion);

    // Sort alphabetically by ID
    filtered.sort((a, b) => a.id.localeCompare(b.id));

    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">No sites match the selected filter.</div>';
      return;
    }

    container.innerHTML = filtered.map(site => renderCard(site)).join('');

    // Click handlers
    container.querySelectorAll('.site-card').forEach(card => {
      card.addEventListener('click', () => {
        const sid = card.dataset.siteId;
        window.location.href = `site.html?id=${sid}`;
      });
    });
  }

  function renderCard(site) {
    const result = _healthData[site.id] || { data: null, error: 'not_loaded' };
    const data = result.data;
    const status = DataLayer.getSiteStatus(data, site);
    const staleness = DataLayer.getStaleness(data);

    let metricsHtml = '';
    if (data && site.oem === 'INTL') {
      const carriers = data.carriers || {};
      const sorter = data.sorter || {};
      metricsHtml = `
        <div class="site-card-metrics">
          <div class="site-card-metric">
            <span>Avail</span>
            <span class="site-card-metric-value">${carriers.availability_pct || '—'}%</span>
          </div>
          <div class="site-card-metric">
            <span>Faulted</span>
            <span class="site-card-metric-value">${carriers.faulted ?? '—'}</span>
          </div>
          <div class="site-card-metric">
            <span>Speed</span>
            <span class="site-card-metric-value">${sorter.speed || '—'}</span>
          </div>
        </div>`;
    } else if (data && site.oem === 'DEM') {
      const trace = data.trace || {};
      metricsHtml = `
        <div class="site-card-metrics">
          <div class="site-card-metric">
            <span>Faults</span>
            <span class="site-card-metric-value">${trace.active_faults ?? '—'}</span>
          </div>
          <div class="site-card-metric">
            <span>Jams</span>
            <span class="site-card-metric-value">${trace.chute_jams ?? '—'}</span>
          </div>
          <div class="site-card-metric">
            <span>SD Trips</span>
            <span class="site-card-metric-value">${trace.carrier_sd_trips ?? '—'}</span>
          </div>
        </div>`;
    }

    const errorOverlay = result.error === 'not_found'
      ? '<div class="site-card-status"><span class="status-dot grey"></span><span class="site-card-status-text grey">Data unavailable</span></div>'
      : '';

    const statusHtml = !result.error
      ? `<div class="site-card-status">
          <span class="status-dot ${status.color} ${staleness.status === 'live' ? 'pulse' : ''}"></span>
          <span class="site-card-status-text ${status.color}">${status.text}</span>
        </div>`
      : errorOverlay || `<div class="site-card-status"><span class="status-dot grey"></span><span class="site-card-status-text grey">Loading...</span></div>`;

    return `
      <div class="site-card status-${status.color}" data-site-id="${site.id}" role="button" tabindex="0" aria-label="View ${site.id} site details">
        <div class="site-card-header">
          <span class="site-card-id">${site.id}</span>
          <span class="site-card-oem oem-${site.oem.toLowerCase()}">${site.oem}</span>
        </div>
        ${statusHtml}
        ${metricsHtml}
        <div class="staleness ${staleness.status}">
          <span>${staleness.label}</span>
        </div>
      </div>`;
  }

  function checkForErrors() {
    const allFailed = Object.values(_healthData).every(r => r.error);
    if (allFailed && Object.keys(_healthData).length > 0) {
      document.getElementById('sites-grid').innerHTML = `
        <div class="error-banner" style="grid-column: 1 / -1;">
          ⚠ All fetch requests failed. Check your network connection.
          <button class="btn-primary" onclick="Overview.refresh()" style="margin-left:12px;">Retry</button>
        </div>`;
    }
  }

  function showRateLimitWarning() {
    const banner = document.getElementById('warning-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.textContent = 'Rate limited — retry in 60s';
    }
  }

  function hideWarnings() {
    const banner = document.getElementById('warning-banner');
    if (banner) banner.classList.add('hidden');
  }

  function updateNavStatus() {
    const el = document.getElementById('nav-refresh-status');
    if (el) {
      const now = new Date();
      el.textContent = `Last refresh: ${now.toLocaleTimeString()}`;
    }
  }

  function startAutoRefresh() {
    _refreshTimer = setInterval(() => {
      if (!document.hidden) refresh();
    }, CONFIG.OVERVIEW_REFRESH_MS);
  }

  function setupVisibilityPause() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh(); // refresh immediately when visible again
    });
  }

  function destroy() {
    if (_refreshTimer) clearInterval(_refreshTimer);
  }

  return { init, refresh, destroy };
})();

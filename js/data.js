/**
 * IXD Systems Dashboard — Data Layer
 * ════════════════════════════════════
 * Handles fetching sites.json and per-site Health_JSON files.
 * Implements rate-limit detection, caching, and staleness calculation.
 */

const DataLayer = (() => {
  let _sites = [];
  let _siteData = {};  // { siteId: { data, fetchedAt, error } }
  let _rateLimited = false;
  let _rateLimitUntil = 0;

  /**
   * Load sites.json configuration
   * @returns {Promise<Array>} Array of site definitions
   */
  async function loadSites() {
    const url = `${CONFIG.DATA_BASE_URL}/${CONFIG.SITES_FILE}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load sites.json (${resp.status})`);
    _sites = await resp.json();
    return _sites;
  }

  function getSites() {
    return _sites;
  }

  /**
   * Fetch health JSON for a single site
   * @param {string} siteId
   * @returns {Promise<Object>} { data, error }
   */
  async function fetchSiteHealth(siteId) {
    if (_rateLimited && Date.now() < _rateLimitUntil) {
      return { data: _siteData[siteId]?.data || null, error: 'rate_limited' };
    }

    const url = `${CONFIG.DATA_BASE_URL}/${siteId}.json`;
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (resp.status === 403) {
        _rateLimited = true;
        _rateLimitUntil = Date.now() + CONFIG.RATE_LIMIT_PAUSE_MS;
        return { data: _siteData[siteId]?.data || null, error: 'rate_limited' };
      }
      if (resp.status === 404) {
        _siteData[siteId] = { data: null, fetchedAt: Date.now(), error: 'not_found' };
        return { data: null, error: 'not_found' };
      }
      if (!resp.ok) {
        return { data: _siteData[siteId]?.data || null, error: `http_${resp.status}` };
      }
      const data = await resp.json();
      _siteData[siteId] = { data, fetchedAt: Date.now(), error: null };
      _rateLimited = false;
      return { data, error: null };
    } catch (e) {
      return { data: _siteData[siteId]?.data || null, error: 'network' };
    }
  }

  /**
   * Fetch health data for all sites
   * @returns {Promise<Object>} Map of siteId -> { data, error }
   */
  async function fetchAllSiteHealth() {
    const results = {};
    const promises = _sites.map(async (site) => {
      results[site.id] = await fetchSiteHealth(site.id);
    });
    await Promise.all(promises);
    return results;
  }

  /**
   * Calculate data staleness
   * @param {Object} data - Health JSON with _pushed_at
   * @returns {{ status: string, label: string, ageSeconds: number }}
   */
  function getStaleness(data) {
    if (!data || !data._pushed_at) {
      return { status: 'nodata', label: 'NO DATA', ageSeconds: Infinity };
    }
    const pushedAt = new Date(data._pushed_at).getTime();
    const now = Date.now();
    const ageSeconds = Math.floor((now - pushedAt) / 1000);

    if (ageSeconds < CONFIG.LIVE_THRESHOLD_S) {
      return { status: 'live', label: 'LIVE', ageSeconds };
    }
    if (ageSeconds < CONFIG.WARN_THRESHOLD_S) {
      const mins = Math.floor(ageSeconds / 60);
      return { status: 'warn', label: `${mins}m ago`, ageSeconds };
    }
    return { status: 'stale', label: 'STALE', ageSeconds };
  }

  /**
   * Determine site overall health status from data
   * @param {Object} data - Health JSON
   * @param {Object} siteMeta - Site metadata from sites.json
   * @returns {{ color: string, text: string }}
   */
  function getSiteStatus(data, siteMeta) {
    if (!data) return { color: 'grey', text: 'No Data' };

    // Disconnected sites always show red
    if (data.connection_status === 'offline') {
      return { color: 'red', text: 'DISCONNECTED' };
    }

    const oem = siteMeta.oem || data.oem;

    if (oem === 'INTL') {
      const sorter = data.sorter || {};
      const actions = data.priority_actions || [];
      const hasCritical = actions.some(a => a.severity === 'CRITICAL');
      const hasWarning = actions.some(a => a.severity === 'WARNING');

      if (!sorter.running) return { color: 'red', text: 'STOPPED' };
      if (hasCritical) return { color: 'red', text: 'CRITICAL' };
      if (hasWarning) return { color: 'yellow', text: `${actions.length} Warning${actions.length > 1 ? 's' : ''}` };
      return { color: 'green', text: 'Running' };
    }

    if (oem === 'DEM') {
      const safety = data.safety_plc || {};
      const sorter = data.sorter || {};
      const trace = data.trace || {};
      const actions = data.priority_actions || [];
      const hasCritical = actions.some(a => a.severity === 'CRITICAL');
      const hasWarning = actions.some(a => a.severity === 'WARNING');

      if (safety.status === 'ESTOP' || safety.estops_active > 0) {
        return { color: 'red', text: 'E-STOP' };
      }
      if (safety.status === 'FAULT' || safety.status === 'SAFDEV_TRIP') {
        return { color: 'red', text: 'Safety Fault' };
      }
      if (!sorter.running && sorter.state !== 'running') {
        return { color: 'red', text: 'STOPPED' };
      }
      if (hasCritical) return { color: 'red', text: 'CRITICAL' };
      if (hasWarning) return { color: 'yellow', text: `${actions.length} Warning${actions.length > 1 ? 's' : ''}` };
      return { color: 'green', text: 'Running' };
    }

    return { color: 'grey', text: 'Unknown OEM' };
  }

  function isRateLimited() {
    return _rateLimited && Date.now() < _rateLimitUntil;
  }

  function getCachedData(siteId) {
    return _siteData[siteId]?.data || null;
  }

  return {
    loadSites,
    getSites,
    fetchSiteHealth,
    fetchAllSiteHealth,
    getStaleness,
    getSiteStatus,
    isRateLimited,
    getCachedData,
  };
})();

/**
 * IXD Systems Dashboard — Site Detail Page Logic
 * ════════════════════════════════════════════════════
 * Renders the per-site deep-dive dashboard.
 * INTL sites get full health sections; DEM sites get simplified view.
 */

const SiteDetail = (() => {
  let _siteId = null;
  let _siteMeta = null;
  let _refreshTimer = null;

  async function init() {
    const params = new URLSearchParams(window.location.search);
    _siteId = params.get('id');

    // RDU2 uses custom dashboard page
    if (_siteId === 'RDU2') {
      window.location.href = 'rdu2.html';
      return;
    }


    if (!_siteId) {
      showNotFound();
      return;
    }

    try {
      await DataLayer.loadSites();
    } catch (e) {
      showError('Unable to load site configuration. Check network connection.');
      return;
    }

    _siteMeta = DataLayer.getSites().find(s => s.id === _siteId);
    if (!_siteMeta) {
      showNotFound();
      return;
    }

    await refresh();
    startAutoRefresh();
    setupVisibilityPause();
  }

  async function refresh() {
    const result = await DataLayer.fetchSiteHealth(_siteId);
    if (result.error === 'rate_limited') {
      showWarning('Rate limited — retry in 60s');
      return;
    }
    if (result.error === 'not_found' && !result.data) {
      showError(`No health data available for ${_siteId}.`);
      return;
    }
    if (result.error && !result.data) {
      showError(`Failed to load data for ${_siteId}. Network error.`);
      return;
    }
    if (result.error && result.data) {
      showWarning('Refresh failed — showing cached data');
    }
    render(result.data);
    updateNavStatus();
  }

  function render(data) {
    const container = document.getElementById('detail-content');
    if (!container) return;

    const oem = _siteMeta.oem;
    const conn = data.connection_status || 'offline';
    const staleness = DataLayer.getStaleness(data);

    let html = `
      <div class="detail-header">
        <a href="index.html" class="back-link">← Overview</a>
        <span class="detail-site-id">${_siteId}</span>
        <span class="site-card-oem oem-${oem.toLowerCase()}">${oem}</span>
        <span class="detail-connection ${conn}">${conn === 'online' ? '● LIVE' : '● OFFLINE'}</span>
        <span class="staleness ${staleness.status}" style="margin-left:auto;">${staleness.label}</span>
      </div>`;

    if (oem === 'INTL') {
      html += renderINTL(data);
    } else if (oem === 'DEM') {
      html += renderDEM(data);
    }

    container.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════
  // INTL SITE RENDER
  // ═══════════════════════════════════════════════════════════════

  function renderINTL(data) {
    const sorter = data.sorter || {};
    const carriers = data.carriers || {};
    const config = data.config || {};
    const scanners = data.scanners || [];
    const ppuList = data.ppu || [];
    const wptList = data.wpt || [];
    const crb = data.crb || {};
    const comms = data.comms || {};
    const lsmZones = data.lsm_zones || [];
    const strays = data.strays || [];
    const lifetime = data.lifetime || {};
    const actions = data.priority_actions || [];
    const carrierCount = data.carrier_count || 2340;

    const faulted = carriers.faulted || 0;
    const speed = sorter.speed || '?';
    const availPct = carriers.availability_pct || 0;
    const nrMax = Math.max(...scanners.map(s => s.nr_pct || 0), 0);
    const wptFaulted = wptList.filter(w => w.error).length;
    const strayCount = strays.length;
    const maxRecirc = config.max_recirc;

    let html = '';

    // --- KPI Cards ---
    html += '<div class="kpi-row">';
    html += kpiCard('Sorter', sorter.running ? `RUNNING ~${speed} mm/s` : 'STOPPED',
      sorter.running ? 'sortation active' : 'not running', sorter.running ? 'green' : 'red');
    html += kpiCard('Worst Scanner NR%', `${nrMax}%`, 'target <3%',
      nrMax > 5 ? 'red' : nrMax > 3 ? 'yellow' : 'green');
    html += kpiCard('Faulted Carriers', String(faulted), `of ${carrierCount} fleet`,
      faulted > 50 ? 'red' : faulted > 20 ? 'yellow' : 'green');
    html += kpiCard('Availability', `${availPct}%`, `${carriers.available || '?'}/${carrierCount}`,
      availPct > 95 ? 'green' : availPct > 90 ? 'yellow' : 'red');

    const crbOk = !crb.master_alarm && (crb.units || []).every(u => !u.connection_faulted);
    html += kpiCard('CRB Status', crbOk ? '4/4 OK' : 'FAULT', 'induction CRBs', crbOk ? 'green' : 'red');

    const wptIds = wptList.filter(w => w.error).map(w => `[${w.index}]`).join('+');
    html += kpiCard('WPT Faults', wptIds || 'None',
      wptFaulted ? `${wptFaulted} positions faulted` : 'all clear',
      wptFaulted > 2 ? 'red' : wptFaulted > 0 ? 'yellow' : 'green');

    html += kpiCard('Active Strays', String(strayCount), strayCount ? `DistTrays active` : 'none',
      strayCount > 2 ? 'red' : strayCount > 0 ? 'yellow' : 'green');
    html += kpiCard('MaxRecirc', String(maxRecirc || '?'),
      `MaxRecircDest=${config.max_recirc_dest || '?'}`,
      maxRecirc && maxRecirc <= 5 ? 'green' : 'red');
    html += '</div>';

    // --- Priority Actions ---
    if (actions.length > 0) {
      html += '<div class="section-panel">';
      html += '<div class="section-title"><span class="section-dot" style="background:var(--orange)"></span> Priority Actions</div>';
      actions.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
      actions.forEach((a, i) => {
        const cls = a.severity === 'CRITICAL' ? 'critical' : a.severity === 'WARNING' ? 'warning' : 'info';
        html += `<div class="action-item ${cls}">
          <span>${i + 1}.</span>
          <div><div class="action-item-title">${esc(a.text)}</div>
          <div class="action-item-detail">${esc(a.component || '')}</div></div></div>`;
      });
      html += '</div>';
    }

    // --- PPU Health ---
    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> PPU Health — Vahle vPOWER (1–6)</div>';
    html += '<div class="health-grid">';
    ppuList.forEach(ppu => {
      const state = ppu.state || 'UNKNOWN';
      let color = 'grey', icon = '—';
      if (state === 'RUNNING') { color = 'green'; icon = '✓ Running'; }
      else if (state === 'ERROR') { color = 'red'; icon = '✗ ERROR'; }
      else if (state === 'WARNING') { color = 'yellow'; icon = '⚠ WARN'; }
      else if (state === 'DISCONNECTED') { color = 'red'; icon = '✗ DISC'; }
      else { icon = '— STOPPED'; }
      html += `<div class="health-cell ${color}">
        <div class="health-cell-label">PPU ${ppu.index}</div>
        <div class="health-cell-value ${color}">${icon}</div></div>`;
    });
    html += '</div></div>';

    // --- WPT CTB/CRB Health ---
    const wptColor = wptFaulted > 0 ? 'yellow' : 'green';
    html += '<div class="section-panel">';
    html += `<div class="section-title"><span class="section-dot" style="background:var(--${wptColor})"></span> WPT CTB/CRB Health — Carrier Health Check [0–15]</div>`;
    html += '<div class="health-grid">';
    wptList.forEach(pos => {
      const color = pos.error ? 'red' : 'green';
      const icon = pos.error ? '✗' : '✓';
      const label = pos.error ? 'FAULT' : 'OK';
      const sub = pos.error && pos.carrier ? `MCB ${pos.carrier}` : '';
      html += `<div class="health-cell ${color}">
        <div class="health-cell-label">[${pos.index}]</div>
        <div class="health-cell-value ${color}">${icon}</div>
        <div class="health-cell-sub">${label} ${sub}</div></div>`;
    });
    html += '</div></div>';

    // --- LSM Drive Health ---
    const lsmFaults = lsmZones.filter(z => z.collision_detect || z.collision_avoid || z.vfd_fault).length;
    const lsmColor = lsmFaults > 0 ? 'yellow' : 'green';
    html += '<div class="section-panel">';
    html += `<div class="section-title"><span class="section-dot" style="background:var(--${lsmColor})"></span> LSM Drive Health — Motor Zones (1–23)</div>`;
    html += '<div class="health-grid">';
    lsmZones.forEach(z => {
      const hasFault = z.collision_detect || z.collision_avoid || z.vfd_fault;
      const color = hasFault ? (z.vfd_fault ? 'red' : 'yellow') : 'green';
      let icon = '✓';
      if (z.vfd_fault) icon = '✗ VFD';
      else if (z.collision_detect) icon = '⚠ CD';
      else if (z.collision_avoid) icon = '⚠ CA';
      html += `<div class="health-cell ${color}">
        <div class="health-cell-label">Zone ${z.zone}</div>
        <div class="health-cell-value ${color}">${icon}</div></div>`;
    });
    html += '</div></div>';

    // --- Scanner Health ---
    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Scanner Health — Weekly NR%</div>';
    scanners.forEach(sc => {
      const pct = sc.nr_pct || 0;
      const barW = Math.min(Math.round(pct / 15 * 100), 100);
      const color = pct > 5.5 ? 'red' : pct > 3 ? 'yellow' : 'green';
      html += `<div class="scanner-bar-row">
        <span class="scanner-bar-label">${esc(sc.label || 'Scanner')}</span>
        <div class="scanner-bar-track"><div class="scanner-bar-fill ${color}" style="width:${barW}%"></div></div>
        <span class="scanner-bar-value ${color}">${pct}%</span></div>`;
    });
    html += '</div>';

    // --- Communications Health ---
    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--orange)"></span> Communications Health</div>';
    html += '<table class="data-table"><thead><tr><th>Category</th><th>Device / Group</th><th>Count</th><th>Status</th></tr></thead><tbody>';
    const ctb = comms.ctb || {};
    const wptCrb = comms.wpt_crb || {};
    const commRows = [
      ['WCS', 'AWCS (Mercury TCP)', '1', comms.awcs_ok !== false],
      ['WCS', 'ICW RoutingMaster', '1', comms.icw_ok !== false],
      ['Discharge CTB', 'DCP_IO_CTB_01–47', String(ctb.total || 47), (ctb.faulted || 0) === 0],
      ['Discharge CRB', 'DCP_IO_CTB_CRB_01–04', '4', crbOk],
      ['WPT CRB', 'DCP_IO_CTB_CRB_WPT_01–16', String(wptCrb.total || 16), (wptCrb.faulted || 0) === 0],
      ['PPU', 'DCP_PPU + DCP_IO_PPU 01–06', '12', (comms.ppu_connections || 0) === (comms.ppu_total || 6)],
    ];
    commRows.forEach(([cat, dev, count, ok]) => {
      const badge = ok ? '<span class="badge-ok">OK</span>' : '<span class="badge-fault">FAULT</span>';
      html += `<tr><td>${cat}</td><td>${dev}</td><td>${count}</td><td>${badge}</td></tr>`;
    });
    html += '</tbody></table></div>';

    // --- Live State Summary ---
    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Live State Summary</div>';
    html += '<table class="data-table"><thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead><tbody>';
    const distIds = strays.map(s => s.dist_trays || '?').join('/');
    const stateRows = [
      ['Sorter Speed', `${sorter.running ? 'RUNNING' : 'STOPPED'} ~${speed} mm/s`, sorter.running ? '✓' : '🔴'],
      ['Faulted Carriers', String(faulted), faulted > 50 ? '⚠' : '✓'],
      ['Disabled Carriers', String(carriers.disabled || '?'), (carriers.disabled || 0) > 100 ? '⚠' : '✓'],
      ['Active Strays', strayCount ? `${strayCount} (${distIds})` : '0', strayCount ? '⚠' : '✓'],
      ['MaxRecirc / Dest', `${maxRecirc || '?'} / ${config.max_recirc_dest || '?'}`, maxRecirc && maxRecirc <= 5 ? '✓' : '🔴'],
      ['ClockFaultCarrier', config.clock_fault_carrier ? `#${config.clock_fault_carrier}` : 'None', config.clock_fault_carrier ? '⚠' : '✓'],
      ['WCS Connections', `AWCS: ${comms.awcs_ok !== false ? 'OK' : 'LOST'} / ICW: ${comms.icw_ok !== false ? 'Active' : 'Inactive'}`, comms.awcs_ok !== false && comms.icw_ok !== false ? '✓' : '🔴'],
      ['Sorted (lifetime)', lifetime.sorted ? Number(lifetime.sorted).toLocaleString() : '—', '—'],
      ['Recirculated', lifetime.recirculated ? `${Number(lifetime.recirculated).toLocaleString()} (${lifetime.recirc_pct || 0}%)` : '—', '—'],
    ];
    stateRows.forEach(([param, val, status]) => {
      html += `<tr><td>${param}</td><td style="font-family:var(--font-mono)">${val}</td><td>${status}</td></tr>`;
    });
    html += '</tbody></table></div>';

    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  // DEM SITE RENDER
  // ═══════════════════════════════════════════════════════════════

  function renderDEM(data) {
    let html = '<div class="dem-notice">⚠ Dematic site — limited telemetry available</div>';

    const safety = data.safety_plc || {};
    const trace = data.trace || {};

    // Safety PLC Status
    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Safety PLC Status</div>';
    html += '<table class="data-table"><thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead><tbody>';
    const safetyOk = safety.status === 'OK';
    html += `<tr><td>Safety PLC</td><td style="font-family:var(--font-mono)">${safety.status || '?'}</td><td>${safetyOk ? '✓' : '🔴'}</td></tr>`;
    html += `<tr><td>E-Stops Active</td><td style="font-family:var(--font-mono)">${safety.estops_active ?? '?'}</td><td>${(safety.estops_active || 0) === 0 ? '✓' : '🔴'}</td></tr>`;
    html += `<tr><td>Gates Open</td><td style="font-family:var(--font-mono)">${safety.gates_open ?? '?'}</td><td>${(safety.gates_open || 0) === 0 ? '✓' : '⚠'}</td></tr>`;
    html += `<tr><td>Zones Bypassed</td><td style="font-family:var(--font-mono)">${safety.zones_bypassed ?? '?'}</td><td>${(safety.zones_bypassed || 0) === 0 ? '✓' : '⚠'}</td></tr>`;
    html += '</tbody></table></div>';

    // Trace Data
    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Trace Data</div>';
    html += '<table class="data-table"><thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead><tbody>';
    html += `<tr><td>Trace Connection</td><td style="font-family:var(--font-mono)">${trace.connected ? 'Connected' : 'Disconnected'}</td><td>${trace.connected ? '✓' : '🔴'}</td></tr>`;
    html += `<tr><td>Active Faults</td><td style="font-family:var(--font-mono)">${trace.active_faults ?? '?'}</td><td>${(trace.active_faults || 0) === 0 ? '✓' : '⚠'}</td></tr>`;
    html += `<tr><td>Chute Jams</td><td style="font-family:var(--font-mono)">${trace.chute_jams ?? '?'}</td><td>${(trace.chute_jams || 0) === 0 ? '✓' : '⚠'}</td></tr>`;
    html += `<tr><td>Carrier SD Trips</td><td style="font-family:var(--font-mono)">${trace.carrier_sd_trips ?? '?'}</td><td>${(trace.carrier_sd_trips || 0) === 0 ? '✓' : '⚠'}</td></tr>`;
    html += `<tr><td>Last Update</td><td style="font-family:var(--font-mono)">${trace.last_update || '—'}</td><td>—</td></tr>`;
    html += '</tbody></table></div>';

    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  function kpiCard(label, value, subtitle, color) {
    return `<div class="kpi-card ${color}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${color}">${value}</div>
      <div class="kpi-subtitle">${subtitle}</div></div>`;
  }

  function severityOrder(s) {
    if (s === 'CRITICAL') return 0;
    if (s === 'WARNING') return 1;
    return 2;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showNotFound() {
    const container = document.getElementById('detail-content');
    if (container) {
      container.innerHTML = `
        <div class="error-banner">Site not found. <a href="index.html" style="color:var(--blue);margin-left:8px;">← Back to Overview</a></div>`;
    }
  }

  function showError(msg) {
    const container = document.getElementById('detail-content');
    if (container) {
      container.innerHTML = `<div class="error-banner">⚠ ${esc(msg)}</div>`;
    }
  }

  function showWarning(msg) {
    const banner = document.getElementById('warning-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.textContent = msg;
    }
  }

  function updateNavStatus() {
    const el = document.getElementById('nav-refresh-status');
    if (el) el.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`;
  }

  function startAutoRefresh() {
    _refreshTimer = setInterval(() => {
      if (!document.hidden) refresh();
    }, CONFIG.DETAIL_REFRESH_MS);
  }

  function setupVisibilityPause() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
  }

  function destroy() {
    if (_refreshTimer) clearInterval(_refreshTimer);
  }

  return { init, refresh, destroy };
})();

/**
 * IXD Insights — Site Detail Page
 * Renders per-site dashboard matching CB4000 KPI layout.
 */
const SiteDetail = (() => {
  let _siteId = null;
  let _siteMeta = null;
  let _refreshTimer = null;

  async function init() {
    const params = new URLSearchParams(window.location.search);
    _siteId = params.get('id');
    if (!_siteId) { showError('No site ID specified.'); return; }
    try { await DataLayer.loadSites(); } catch(e) { showError('Failed to load sites.'); return; }
    _siteMeta = DataLayer.getSites().find(s => s.id === _siteId);
    if (!_siteMeta) { showError(`Site ${_siteId} not found.`); return; }
    await refresh();
    _refreshTimer = setInterval(() => { if (!document.hidden) refresh(); }, CONFIG.DETAIL_REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  async function refresh() {
    const result = await DataLayer.fetchSiteHealth(_siteId);
    if (result.error === 'rate_limited') return;
    if (!result.data) { showError(`No data for ${_siteId}.`); return; }
    render(result.data);
    const el = document.getElementById('nav-refresh-status');
    if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString();
  }

  function render(data) {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const oem = (_siteMeta.oem || data.oem || '').toUpperCase();
    if (oem === 'INTL') container.innerHTML = renderINTL(data);
    else if (oem === 'DEM') container.innerHTML = renderDEM(data);
    else container.innerHTML = '<div class="error-banner">Unknown OEM.</div>';
  }

  function renderINTL(d) {
    const sorter = d.sorter || {};
    const carriers = d.carriers || {};
    const config = d.config || {};
    const scanners = d.scanners || [];
    const ppuList = d.ppu || [];
    const wptList = d.wpt || [];
    const crb = d.crb || {};
    const comms = d.comms || {};
    const lsmZones = d.lsm_zones || [];
    const strays = d.strays || [];
    const lifetime = d.lifetime || {};
    const actions = d.priority_actions || [];
    const weekly = d.weekly || {};
    const total = d.carrier_count || 2340;

    const faulted = carriers.faulted || 0;
    const disabled = carriers.disabled || 0;
    const available = carriers.available || 0;
    const speed = sorter.speed || 0;
    const running = sorter.running;
    const availPct = carriers.availability_pct || 0;
    const maxRecirc = config.max_recirc;
    const wptFaulted = wptList.filter(w => w.error).length;
    const recircPct = weekly.recirc_pct || lifetime.recirc_pct || 0;
    const fpyPct = weekly.fpy_pct;
    const scanDefect = weekly.scan_defect_pct;
    const mheDefect = weekly.mhe_defect_pct;
    const inducted = weekly.inducted;
    const diverted = weekly.diverted;

    let h = '';

    // Sub-tabs
    h += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="filter-btn active">Overview</button>
      <button class="filter-btn">CP Zones</button>
      <button class="filter-btn">Metrics</button>
      <button class="filter-btn">Shift Reports</button>
      <a href="https://w.amazon.com/bin/view/IXD-SD/SITES/RDU2" target="_blank" class="filter-btn" style="text-decoration:none;">IXD Wiki ↗</a>
      <button class="filter-btn">Outbound</button>
      <button class="filter-btn">Inbound</button>
      <button class="filter-btn">Sorter</button>
      <button class="filter-btn">Induction</button>
    </div>`;

    // Header
    h += `<div class="detail-header">
      <a href="sites.html" class="back-link">\u2190 Back to Fleet</a>
      <span class="detail-site-id">${_siteId}</span>
      <span class="site-card-oem oem-intl">INTL</span>
      <span class="detail-connection ${running ? 'online' : 'offline'}">${running ? '\u25cf LIVE' : '\u25cf OFFLINE'}</span>
    </div>`;

    h += `<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:5px;border-bottom:1px solid var(--border);">\ud83c\udfed ${_siteId} \u2014 10.8.188.183 | Wk25</div>`;

    // Sorter banner
    const bannerColor = running ? 'var(--green)' : 'var(--red)';
    const bannerBg = running ? 'var(--green-bg)' : 'var(--red-bg)';
    h += `<div style="display:flex;align-items:center;justify-content:center;padding:10px 20px;margin-bottom:14px;border-radius:8px;background:${bannerBg};border:1px solid ${bannerColor};">
      <span style="font-size:14px;font-weight:700;color:${bannerColor};letter-spacing:0.05em;">\u25cf ${running ? 'SORTER RUNNING' : 'SORTER STOPPED'}</span></div>`;

    // KPI Cards - 4 columns matching Benplaci layout
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    h += kpi('Sorter Availability', `${availPct}%`, 'empty carriers / total', availPct < 50 ? 'red' : availPct < 90 ? 'yellow' : 'green');
    h += kpi('Faulted Carriers', String(faulted), 'MCB failures', faulted > 50 ? 'red' : faulted > 20 ? 'yellow' : 'green');
    h += kpi('Disabled Carriers', String(disabled), 'out of service', disabled > 100 ? 'red' : disabled > 50 ? 'yellow' : 'green');
    h += kpi('Total Inducted', inducted ? Number(inducted).toLocaleString() : '\u2014', 'this week', 'green');
    h += kpi('Total Diverted', diverted ? Number(diverted).toLocaleString() : '\u2014', 'this week', 'green');
    h += kpi('Max Recirc %', `${recircPct}%`, 'target <1%', recircPct > 2 ? 'red' : recircPct > 1 ? 'yellow' : 'green');
    h += kpi('Lane Full %', weekly.lane_full_pct != null ? `${weekly.lane_full_pct}%` : '\u2014', 'chutes at capacity', weekly.lane_full_pct != null ? (weekly.lane_full_pct > 5 ? 'red' : weekly.lane_full_pct > 2 ? 'yellow' : 'green') : 'yellow');
    h += kpi('FPY', fpyPct != null ? `${fpyPct}%` : '\u2014', 'Wk25', fpyPct != null ? (fpyPct >= 95 ? 'green' : fpyPct >= 80 ? 'yellow' : 'red') : 'yellow');
    h += kpi('Scan Defect', scanDefect != null ? `${scanDefect}%` : '\u2014', 'Wk25', scanDefect != null ? (scanDefect > 5.5 ? 'red' : scanDefect > 3 ? 'yellow' : 'green') : 'yellow');
    h += kpi('MHE Defect', mheDefect != null ? `${mheDefect}%` : '\u2014', 'Wk25', mheDefect != null ? (mheDefect > 3 ? 'red' : mheDefect > 1.5 ? 'yellow' : 'green') : 'green');
    h += kpi('IOB Trips', weekly.iob_trips != null ? String(weekly.iob_trips) : '\u2014', 'this week', weekly.iob_trips != null ? (weekly.iob_trips > 20 ? 'red' : weekly.iob_trips > 5 ? 'yellow' : 'green') : 'yellow');
    h += kpi('E-Stop Events', weekly.estop_events != null ? String(weekly.estop_events) : '\u2014', 'this week', weekly.estop_events != null ? (weekly.estop_events > 10 ? 'red' : weekly.estop_events > 3 ? 'yellow' : 'green') : 'yellow');
    h += '</div>';

    // PPU Health
    h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> PPU Health \u2014 Vahle vPOWER (1\u20136)</div>';
    h += '<div class="health-grid">';
    ppuList.forEach(p => {
      const st = p.state || 'UNKNOWN';
      const color = st === 'RUNNING' ? 'green' : st === 'ERROR' ? 'red' : st === 'WARNING' ? 'yellow' : 'grey';
      const icon = st === 'RUNNING' ? '\u2713 Running' : st === 'ERROR' ? '\u2717 ERROR' : st === 'WARNING' ? '\u26a0 WARN' : '\u2014 ' + st;
      h += `<div class="health-cell ${color}"><div class="health-cell-label">PPU ${p.index}</div><div class="health-cell-value ${color}">${icon}</div></div>`;
    });
    h += '</div></div>';

    // WPT CTB/CRB Health [0-15]
    const wptColor = wptFaulted > 0 ? 'yellow' : 'green';
    h += `<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--${wptColor})"></span> WPT CTB/CRB Health \u2014 Carrier Health Check [0\u201315]</div>`;
    h += '<div class="health-grid">';
    wptList.forEach(pos => {
      const color = pos.error ? 'red' : 'green';
      const icon = pos.error ? '\u2717' : '\u2713';
      const label = pos.error ? 'FAULT' : 'OK';
      const sub = pos.error && pos.carrier ? `MCB ${pos.carrier}` : (pos.error ? 'MCB null' : '');
      h += `<div class="health-cell ${color}"><div class="health-cell-label">[${pos.index}]</div><div class="health-cell-value ${color}">${icon}</div><div class="health-cell-sub">${label}</div>${sub ? `<div class="health-cell-sub">${sub}</div>` : ''}</div>`;
    });
    h += '</div></div>';

    // Discharge CRBs
    const crbUnits = crb.units || [];
    if (crbUnits.length > 0) {
      h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Discharge CRBs \u2014 Belt Confirm Receivers (1\u20134)</div>';
      h += '<div class="health-grid">';
      crbUnits.forEach(u => {
        const ok = !u.connection_faulted;
        const color = ok ? 'green' : 'red';
        h += `<div class="health-cell ${color}"><div class="health-cell-label">CRB ${u.index}</div><div class="health-cell-value ${color}">${ok ? '\u2713 OK' : '\u2717 FAULT'}</div></div>`;
      });
      h += '</div></div>';
    }

    // LSM Drive Health
    if (lsmZones.length > 0) {
      const lsmFaults = lsmZones.filter(z => z.collision_detect || z.collision_avoid || z.vfd_fault).length;
      const lsmColor = lsmFaults > 0 ? 'yellow' : 'green';
      h += `<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--${lsmColor})"></span> LSM Drive Health (1\u201323)</div>`;
      h += '<div class="health-grid">';
      lsmZones.forEach(z => {
        const hasFault = z.collision_detect || z.collision_avoid || z.vfd_fault;
        const color = hasFault ? (z.vfd_fault ? 'red' : 'yellow') : 'green';
        let icon = '\u2713';
        if (z.vfd_fault) icon = '\u2717 VFD';
        else if (z.collision_detect) icon = '\u26a0 CD';
        else if (z.collision_avoid) icon = '\u26a0 CA';
        h += `<div class="health-cell ${color}"><div class="health-cell-label">Zone ${z.zone}</div><div class="health-cell-value ${color}">${icon}</div></div>`;
      });
      h += '</div></div>';
    }

    // Scanner Health
    if (scanners.length > 0) {
      h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Scanner Health \u2014 Weekly NR%</div>';
      scanners.forEach(sc => {
        const pct = sc.nr_pct || 0;
        const barW = Math.min(Math.round(pct / 15 * 100), 100);
        const color = pct > 5.5 ? 'red' : pct > 3 ? 'yellow' : 'green';
        h += `<div class="scanner-bar-row"><span class="scanner-bar-label">${esc(sc.label || 'Scanner')}</span><div class="scanner-bar-track"><div class="scanner-bar-fill ${color}" style="width:${barW}%"></div></div><span class="scanner-bar-value ${color}">${pct}%</span></div>`;
      });
      h += '</div>';
    }

    // Communications
    h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--orange)"></span> Communications Health</div>';
    h += '<table class="data-table"><thead><tr><th>System</th><th>Status</th></tr></thead><tbody>';
    h += `<tr><td>AWCS (Mercury TCP)</td><td>${comms.awcs_ok !== false ? '<span class="badge-ok">OK</span>' : '<span class="badge-fault">LOST</span>'}</td></tr>`;
    h += `<tr><td>ICW RoutingMaster</td><td>${comms.icw_ok !== false ? '<span class="badge-ok">OK</span>' : '<span class="badge-fault">INACTIVE</span>'}</td></tr>`;
    h += `<tr><td>WPT CRB (16 positions)</td><td>${wptFaulted === 0 ? '<span class="badge-ok">OK</span>' : `<span class="badge-fault">${wptFaulted} FAULTED</span>`}</td></tr>`;
    h += `<tr><td>PPU Units (6 total)</td><td>${ppuList.filter(p=>p.state==='RUNNING').length === 6 ? '<span class="badge-ok">6/6 OK</span>' : `<span class="badge-fault">${ppuList.filter(p=>p.state==='RUNNING').length}/6</span>`}</td></tr>`;
    h += '</tbody></table></div>';

    // Priority Actions
    if (actions.length > 0) {
      h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--orange)"></span> Priority Actions</div>';
      actions.forEach((a, i) => {
        const cls = a.severity === 'CRITICAL' ? 'critical' : a.severity === 'WARNING' ? 'warning' : 'info';
        h += `<div class="action-item ${cls}"><span>${i+1}.</span><div><div class="action-item-title">${esc(a.text)}</div><div class="action-item-detail">${esc(a.component || '')}</div></div></div>`;
      });
      h += '</div>';
    }

    // Live State Summary
    h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Live State Summary</div>';
    h += '<table class="data-table"><thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead><tbody>';
    h += `<tr><td>Sorter Speed</td><td>${running ? 'RUNNING' : 'STOPPED'} ~${speed} mm/s</td><td>${running ? '\u2713' : '\ud83d\udd34'}</td></tr>`;
    h += `<tr><td>Faulted Carriers</td><td>${faulted}</td><td>${faulted > 50 ? '\u26a0' : '\u2713'}</td></tr>`;
    h += `<tr><td>Disabled Carriers</td><td>${disabled}</td><td>${disabled > 100 ? '\u26a0' : '\u2713'}</td></tr>`;
    h += `<tr><td>Active Strays</td><td>${strays.length ? strays.length + ' (' + strays.map(s=>s.dist_trays||'?').join('/') + ')' : '0'}</td><td>${strays.length ? '\u26a0' : '\u2713'}</td></tr>`;
    h += `<tr><td>MaxRecirc / Dest</td><td>${maxRecirc || '?'} / ${config.max_recirc_dest || '?'}</td><td>${maxRecirc && maxRecirc <= 5 ? '\u2713' : '\ud83d\udd34'}</td></tr>`;
    h += `<tr><td>ClockFaultCarrier</td><td>${config.clock_fault_carrier ? '#' + config.clock_fault_carrier : 'None'}</td><td>${config.clock_fault_carrier ? '\u26a0' : '\u2713'}</td></tr>`;
    h += `<tr><td>WCS Connections</td><td>AWCS: ${comms.awcs_ok !== false ? 'OK' : 'LOST'} / ICW: ${comms.icw_ok !== false ? 'Active' : 'Inactive'}</td><td>${comms.awcs_ok !== false && comms.icw_ok !== false ? '\u2713' : '\ud83d\udd34'}</td></tr>`;
    h += '</tbody></table></div>';

    return h;
  }

  function renderDEM(d) {
    let h = '<div class="dem-notice">\u26a0 Dematic site \u2014 limited telemetry available</div>';
    h += `<div class="detail-header"><a href="sites.html" class="back-link">\u2190 Back</a><span class="detail-site-id">${_siteId}</span><span class="site-card-oem oem-dem">DEM</span></div>`;
    const safety = d.safety_plc || {};
    const trace = d.trace || {};
    h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Safety PLC</div>';
    h += '<table class="data-table"><tbody>';
    h += `<tr><td>Status</td><td>${safety.status || '?'}</td><td>${safety.status === 'OK' ? '\u2713' : '\ud83d\udd34'}</td></tr>`;
    h += `<tr><td>E-Stops Active</td><td>${safety.estops_active ?? '?'}</td><td>${(safety.estops_active || 0) === 0 ? '\u2713' : '\ud83d\udd34'}</td></tr>`;
    h += '</tbody></table></div>';
    h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Trace</div>';
    h += '<table class="data-table"><tbody>';
    h += `<tr><td>Connected</td><td>${trace.connected ? 'Yes' : 'No'}</td><td>${trace.connected ? '\u2713' : '\ud83d\udd34'}</td></tr>`;
    h += `<tr><td>Active Faults</td><td>${trace.active_faults ?? '?'}</td><td>${(trace.active_faults || 0) === 0 ? '\u2713' : '\u26a0'}</td></tr>`;
    h += '</tbody></table></div>';
    return h;
  }

  function kpi(label, value, sub, color) {
    return `<div class="kpi-card ${color}"><div class="kpi-label">${label}</div><div class="kpi-value ${color}">${value}</div><div class="kpi-subtitle">${sub}</div></div>`;
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function showError(msg) { const c = document.getElementById('detail-content'); if(c) c.innerHTML = `<div class="error-banner">${msg} <a href="sites.html" style="color:var(--blue);margin-left:8px;">\u2190 Back</a></div>`; }

  return { init, refresh };
})();

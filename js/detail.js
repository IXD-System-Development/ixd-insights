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

    // Add sub-tab styles and handler
    if (_siteId === 'RDU2' && !document.getElementById('rdu2-stab-style')) {
      const style = document.createElement('style');
      style.id = 'rdu2-stab-style';
      style.textContent = `.rdu2-stab{padding:5px 14px;border:1px solid var(--border,#30363d);border-radius:6px;cursor:pointer;background:var(--card,#161b22);color:var(--text-secondary,#7d8590);font-size:12px;transition:all .15s;}.rdu2-stab.active{background:var(--blue,#58a6ff);border-color:var(--blue,#58a6ff);color:#0d1117;font-weight:600;}.rdu2-stab:hover:not(.active){border-color:var(--blue,#58a6ff);color:var(--blue,#58a6ff);}`;
      document.head.appendChild(style);
    }

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

    // --- RDU2 Sub-tab bar (at top) ---
    if (_siteId === 'RDU2') {
      html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border,#30363d);">
        <button class="rdu2-stab active" onclick="rdu2SubTab(-1)">Overview</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(0)">CP Zones</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(1)">Metrics</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(2)">Shift Reports</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(3)">IXD Wiki</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(4)">Outbound</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(5)">Inbound</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(6)">Sorter</button>
        <button class="rdu2-stab" onclick="rdu2SubTab(7)">Induction</button>
      </div>`;
      html += '<div id="rdu2-overview-content">';
    }

    // --- KPI Cards (our layout: 3 rows of 4) ---
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px;">';
    html += kpiCard('Sorter Availability', `${100 - availPct}%`, 'empty carriers / total', availPct > 90 ? 'green' : 'red');
    html += kpiCard('Faulted Carriers', String(faulted), 'MCB failures', faulted > 50 ? 'red' : faulted > 20 ? 'yellow' : 'green');
    html += kpiCard('Disabled Carriers', String(carriers.disabled || 0), 'out of service', (carriers.disabled || 0) > 40 ? 'yellow' : 'green');
    html += kpiCard('Total Inducted', '845,427', 'this week', 'green');
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px;">';
    html += kpiCard('Total Diverted', '1,176,018', 'this week', 'green');
    html += kpiCard('Max Recirc %', `${lifetime.recirc_pct || 0}%`, 'target <1%', (lifetime.recirc_pct || 0) > 1 ? 'yellow' : 'green');
    html += kpiCard('Lane Full %', '3.2%', 'chutes at capacity', 'yellow');
    html += kpiCard('FPY', '99.7%', 'Wk25', 'green');
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    html += kpiCard('Scan Defect', `${nrMax}%`, 'Wk25 weekly', nrMax > 5.5 ? 'red' : nrMax > 3 ? 'yellow' : 'green');
    html += kpiCard('MHE Defect', '0.31%', 'Wk25 weekly', 'green');
    html += kpiCard('IOB Trips', '15', '89 min this week', 'yellow');
    html += kpiCard('E-Stop Events', '6', '48 min this week', 'yellow');
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

    
    // ═══ RDU2 SUB-TABS (CP Zones, Metrics, Shifts, Wiki, Outbound, Inbound, Sorter, Induction) ═══
    if (_siteId === 'RDU2') {
      html += `<div style="margin-top:20px;border-top:2px solid var(--border,#30363d);padding-top:16px;">
        
        </div>\n<div id="rdu2-st-0" class="rdu2-st-pane" style="display:block;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> CP Panel Zone Assignment</div>
          <table class="data-table"><thead><tr><th>Panel</th><th>Zone / Description</th></tr></thead><tbody>
          <tr><td>CP01</td><td>Receiving Inbound</td></tr><tr><td>CP02</td><td>Receiving North</td></tr>
          <tr><td>CP31</td><td>SIPS – ATAC Lines</td></tr><tr><td>CP33</td><td>TTCB Jackpot South</td></tr>
          <tr><td>CP34</td><td>TTCB Jackpot North</td></tr><tr><td>CP41</td><td>20 lb. UIS</td></tr>
          <tr><td>CP51</td><td>Each to Sort</td></tr><tr><td>CP60</td><td>RPND West</td></tr>
          <tr><td>CP67</td><td>IntelliMerge + IntelliSort</td></tr><tr><td>CP71-74</td><td>Fluid Load SE/SW</td></tr>
          <tr><td>CP76-79</td><td>Fluid Load NE/NW</td></tr><tr><td>CP82-85</td><td>TTCB Loop Sorter (4-panel)</td></tr>
          <tr><td>CP90-94</td><td>Pallet Build + Robotic Palletizer</td></tr>
          </tbody></table></div>
        </div>
        <div id="rdu2-st-1" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Weekly Metrics (Wk25)</div>
          <table class="data-table"><thead><tr><th>Metric</th><th>Value</th><th>Target</th></tr></thead><tbody>
          <tr><td>Scan Defect</td><td>3.43%</td><td>&lt;3.0%</td></tr>
          <tr><td>MHE Defect (FTD%)</td><td>0.31%</td><td>&lt;1.5%</td></tr>
          <tr><td>FPY</td><td>99.7%</td><td>&gt;95%</td></tr>
          <tr><td>Failed Diverts</td><td>25,691</td><td>—</td></tr>
          <tr><td>Total Inducted</td><td>845,427</td><td>—</td></tr>
          <tr><td>Total Diverted</td><td>1,176,018</td><td>—</td></tr>
          </tbody></table></div>
        </div>
        <div id="rdu2-st-2" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Shift Report Schedule</div>
          <table class="data-table"><thead><tr><th>Report</th><th>Schedule</th><th>Channel</th></tr></thead><tbody>
          <tr><td>Shift Summary</td><td>7am / 7pm</td><td>metrics</td></tr>
          <tr><td>Sorter Health</td><td>9am daily</td><td>RDU2 production</td></tr>
          <tr><td>Carrier Report</td><td>5am / 5pm</td><td>carrier_faults</td></tr>
          <tr><td>Hourly Scanner</td><td>Every hour</td><td>metrics</td></tr>
          </tbody></table></div>
        </div>
        <div id="rdu2-st-3" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--yellow)"></span> IXD Wiki</div>
          <p style="color:var(--text-secondary)"><a href="https://w.amazon.com/bin/view/IXD-SD/SITES/RDU2" target="_blank" style="color:var(--blue)">Open RDU2 Wiki ↗</a></p>
          <iframe src="https://w.amazon.com/bin/view/IXD-SD/SITES/RDU2" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:8px;margin-top:8px;"></iframe>
          </div>
        </div>
        <div id="rdu2-st-4" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Outbound Zones</div>
          <table class="data-table"><thead><tr><th>Zone</th><th>Panel</th><th>Description</th></tr></thead><tbody>
          <tr><td>RPND West</td><td>CP60</td><td>Robotic palletize west</td></tr>
          <tr><td>RPND East</td><td>CP62-63</td><td>East center + inbound</td></tr>
          <tr><td>Fluid Load SE</td><td>CP71-72</td><td>Southeast lanes</td></tr>
          <tr><td>Fluid Load SW</td><td>CP73-74</td><td>Southwest lanes</td></tr>
          <tr><td>Fluid Load NE/NW</td><td>CP76-79</td><td>North lanes</td></tr>
          <tr><td>Pallet Build</td><td>CP90-94</td><td>Palletizer south/north</td></tr>
          </tbody></table></div>
        </div>
        <div id="rdu2-st-5" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Inbound Zones</div>
          <table class="data-table"><thead><tr><th>Zone</th><th>Panel</th><th>Description</th></tr></thead><tbody>
          <tr><td>Receiving</td><td>CP01-02</td><td>Main receiving + north</td></tr>
          <tr><td>SIPS/ATAC</td><td>CP31</td><td>SIPS – ATAC lines</td></tr>
          <tr><td>UIS</td><td>CP41-42</td><td>20 lb + 5 lb UIS</td></tr>
          <tr><td>Each to Sort</td><td>CP51-53</td><td>Each to sort zones</td></tr>
          </tbody></table></div>
        </div>
        <div id="rdu2-st-6" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> TTCB Shoe Sorter</div>
          <table class="data-table"><thead><tr><th>Parameter</th><th>Value</th></tr></thead><tbody>
          <tr><td>Total Chutes</td><td>144 active</td></tr>
          <tr><td>Divert Confirmation</td><td>4 Discharge CRBs</td></tr>
          <tr><td>Health Check</td><td>16 WPT CTB/CRB positions</td></tr>
          <tr><td>Carrier Belt Tension</td><td>130N new / 110N used</td></tr>
          <tr><td>MCB Board</td><td>432D757.CB — reprogram via CCT</td></tr>
          </tbody></table></div>
        </div>
        <div id="rdu2-st-7" class="rdu2-st-pane" style="display:none;">
          <div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Induction System</div>
          <table class="data-table"><thead><tr><th>Station</th><th>Sub-PLC</th><th>Inductions</th></tr></thead><tbody>
          <tr><td>Induct 1-4</td><td>CP67</td><td>Parcel inductions 1-4</td></tr>
          <tr><td>Induct 5-8</td><td>CP02</td><td>Parcel inductions 5-8</td></tr>
          <tr><td>Induct 10-13</td><td>CP67</td><td>Parcel inductions 10-13</td></tr>
          <tr><td>Induct 15-18</td><td>CP01</td><td>Parcel inductions 15-18</td></tr>
          </tbody></table></div>
        </div>
      </div>`;
    }

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

  
  // RDU2 sub-tab switcher (global)
  window.rdu2SubTab = function(n) {
    var overview = document.getElementById('rdu2-overview-content');
    for (var i = 0; i <= 7; i++) {
      var el = document.getElementById('rdu2-st-' + i);
      if (el) el.style.display = (i === n) ? 'block' : 'none';
    }
    if (n === -1) {
      if (overview) overview.style.display = 'block';
      for (var i = 0; i <= 7; i++) {
        var el = document.getElementById('rdu2-st-' + i);
        if (el) el.style.display = 'none';
      }
    } else {
      if (overview) overview.style.display = 'none';
    }
    document.querySelectorAll('.rdu2-stab').forEach(function(btn, idx) {
      btn.classList.toggle('active', (n === -1 && idx === 0) || (n >= 0 && idx === n + 1));
    });
    window.scrollTo(0, 0);
  };

return { init, refresh, destroy };
})();

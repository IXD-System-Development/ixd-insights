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
    // Update header clock
    const clockEl = document.getElementById('header-clock');
    if (clockEl) {
      const now = new Date();
      const est = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      clockEl.textContent = est.toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',second:'2-digit'}) + ' EST';
    }
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
    const sorterOte = weekly.sorter_ote;
    const sorterOee = weekly.sorter_oee;
    const downtimePct = weekly.downtime_pct;
    const fpyPct = weekly.sorter_fpy_icw || weekly.fpy_pct;
    const scanDefect = weekly.scan_defect_pct;
    const mheDefect = weekly.mhe_defect_icw || weekly.mhe_defect_pct;
    const inducted = weekly.inducted;
    const diverted = weekly.diverted;

    let h = '';

    // Sub-tabs
    h += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="filter-btn active">Overview</button>
      <button class="filter-btn">CP Zones</button>
      <button class="filter-btn" onclick="SiteDetail.showMetricsTab()">MHE Defect</button>
      <button class="filter-btn" onclick="SiteDetail.showShiftReport()">Shift Reports</button>
      <a href="https://w.amazon.com/bin/view/IXD-SD/SITES/${_siteId}" target="_blank" class="filter-btn" style="text-decoration:none;">IXD Wiki ↗</a>
      <button class="filter-btn" onclick="SiteDetail.showChuteJamsTab()">Chute Jams</button>
      <button class="filter-btn" onclick="SiteDetail.showInboundTab()">Inbound Jams</button>
      <button class="filter-btn" onclick="SiteDetail.showSorterTab()">🦅 MR.BOBB's Simurgh</button>
      <button class="filter-btn" onclick="SiteDetail.showOutboundSouth()">Outbound Southside Jam</button><button class="filter-btn" onclick="SiteDetail.showOutboundNorth()">Outbound Northside Jam</button><button class="filter-btn" onclick="SiteDetail.showShoeSorter()">Shoe Sorter</button><button class="filter-btn" onclick="SiteDetail.showFrontOfBuilding()">Front of Building Jams</button>${_siteId === 'IAH3' ? '<button class="filter-btn" onclick="SiteDetail.showIah3LizardTab()" style="background:var(--yellow-bg);border-color:var(--yellow);color:var(--yellow);">&#128994; IAH3 Slack Chat</button>' : ''}
    </div>`;

    // Header
    h += `<div class="detail-header">
      <a href="sites.html" class="back-link">\u2190 Back to Fleet</a>
      <span class="detail-site-id">${_siteId}</span><img src="img/${_siteId.toLowerCase()}_logo.png" alt="${_siteId}" style="height:40px;border-radius:50%;margin-left:8px;">
      <span class="site-card-oem oem-intl">INTL</span>
      <span class="detail-connection ${running ? 'online' : 'offline'}">${running ? '\u25cf LIVE' : '\u25cf OFFLINE'}</span>
      <span id="header-clock" style="color:#3fb950;font-weight:600;font-size:12px;margin-left:auto;"></span>
    </div>`;

    h += `<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:5px;border-bottom:1px solid var(--border);">\ud83c\udfed ${_siteId} \u2014 ${_siteId} Sorter | Wk${(() => { const d2=new Date(); const onejan=new Date(d2.getFullYear(),0,1); return Math.ceil((((d2-onejan)/86400000)+onejan.getDay()+1)/7); })()}</div>`;

    // Sorter banner
    const bannerColor = running ? 'var(--green)' : 'var(--red)';
    const bannerBg = running ? 'var(--green-bg)' : 'var(--red-bg)';
    h += `<div style="display:flex;align-items:center;justify-content:center;padding:10px 20px;margin-bottom:14px;border-radius:8px;background:${bannerBg};border:1px solid ${bannerColor};">
      <span style="font-size:14px;font-weight:700;color:${bannerColor};letter-spacing:0.05em;">\u25cf ${running ? 'SORTER RUNNING' : 'SORTER STOPPED'}</span></div>`;

    // DTW banner (blue flash) or fault bar (red flash)
    // Combine legacy active_faults with sorter_stop_causes + recent collision events
    const activeFaults = [
      ...((d.sorter || {}).active_faults || []),
      ...(d.sorter_stop_causes || []),
    ];
    // Collision events that happened in the last 30 minutes flash in the banner
    (d.collision_events || []).forEach(ev => {
      if (!ev.time) return;
      const evMs = new Date(ev.time.replace(' ','T')+'Z').getTime();
      if ((Date.now() - evMs) < 30 * 60 * 1000) {
        const lmPart = ev.lm ? ' LM'+ev.lm : '';
        activeFaults.push(ev.type+' Zone '+ev.zone+lmPart+' CA-'+String(ev.carrier||0).padStart(4,'0')+' @ '+ev.time.slice(11,16));
      }
    });
    const inDtw = (d.sorter || {}).in_dtw || false;
    if (inDtw && !sorter.running) {
      h += '<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 20px;margin-bottom:14px;border-radius:8px;background:var(--blue-bg);border:2px solid var(--blue);animation:dtw-flash 1.5s infinite;">';
      h += '<span style="font-size:20px;">\ud83d\udee0\ufe0f</span>';
      h += '<span style="font-size:14px;font-weight:700;color:var(--blue);letter-spacing:0.03em;">SCHEDULED DOWNTIME (DTW)</span>';
      h += '<span style="font-size:20px;">\ud83d\udee0\ufe0f</span>';
      h += '</div>';
      h += '<style>@keyframes dtw-flash{0%,100%{opacity:1;border-color:var(--blue)}50%{opacity:0.6;border-color:transparent}}</style>';
    } else if (activeFaults.length > 0) {
      h += '<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 20px;margin-bottom:14px;border-radius:8px;background:var(--red-bg);border:2px solid var(--red);animation:fault-flash 1s infinite;">';
      h += '<span style="font-size:20px;">\u26a0\ufe0f</span>';
      h += '<span style="font-size:14px;font-weight:700;color:var(--red);letter-spacing:0.03em;">' + activeFaults.join(' \u2022 ') + '</span>';
      h += '<span style="font-size:20px;">\u26a0\ufe0f</span>';
      h += '</div>';
      h += '<style>@keyframes fault-flash{0%,100%{opacity:1;border-color:var(--red)}50%{opacity:0.4;border-color:transparent}}</style>';
    }

    // KPI Cards - 4 columns matching Benplaci layout
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    h += kpi('Carrier Avail', `${availPct}%`, `${available} / ${total}`, availPct > 95 ? 'green' : availPct > 90 ? 'yellow' : 'red');
    h += kpi('Faulted Carriers', String(faulted), 'MCB failures', faulted > 50 ? 'red' : faulted > 20 ? 'yellow' : 'green');
    h += kpi('Disabled Carriers', String(disabled), 'out of service', disabled > 25 ? 'red' : disabled > 10 ? 'yellow' : 'green');
    h += kpi('Total Inducted', inducted ? Number(inducted).toLocaleString() : '\u2014', 'this week', 'green');
    h += kpi('Total Diverted', diverted ? Number(diverted).toLocaleString() : '\u2014', 'this week', 'green');
    h += kpi('Max Recirc %', `${recircPct}%`, 'target <1%', recircPct > 2 ? 'red' : recircPct > 1 ? 'yellow' : 'green');
    // RECIRCULATING + OCCUPIED row
    const _recirc   = (sorter && sorter.items_recirculating != null) ? sorter.items_recirculating : null;
    const _occupied = (sorter && sorter.items_on_sorter != null && sorter.items_on_sorter > 0) ? sorter.items_on_sorter : null;
    h += kpi('RECIRCULATING', _recirc !== null ? String(_recirc) : '\u2014', 'on loop right now', _recirc > 50 ? 'red' : _recirc > 10 ? 'yellow' : 'green');
    h += kpi('OCCUPIED', _occupied !== null ? String(_occupied) : '\u2014', 'carrying items', 'blue');
    h += kpi('Lane Full %', weekly.lane_full_pct != null ? `${weekly.lane_full_pct}%` : '\u2014', 'chutes at capacity', weekly.lane_full_pct != null ? (weekly.lane_full_pct > 5 ? 'red' : weekly.lane_full_pct > 2 ? 'yellow' : 'green') : 'yellow');
    h += kpi('Crossbelt FPY', fpyPct != null ? `${fpyPct}%` : '\u2014', 'Wk25', fpyPct != null ? (fpyPct >= 95 ? 'green' : fpyPct >= 80 ? 'yellow' : 'red') : 'yellow');
    h += kpi('Crossbelt Scan NR%', scanDefect != null ? `${scanDefect}%` : '\u2014', 'Wk25', scanDefect != null ? (scanDefect > 5.5 ? 'red' : scanDefect > 3 ? 'yellow' : 'green') : 'yellow');
    h += kpi('Sort MHE Defect', mheDefect != null ? `${mheDefect}%` : '\u2014', 'Wk25', mheDefect != null ? (mheDefect > 3 ? 'red' : mheDefect > 1.5 ? 'yellow' : 'green') : 'green');
    h += kpi('IOB Trips', weekly.iob_downtime_min != null ? `${weekly.iob_trips} / ${weekly.iob_downtime_min} min` : '\u2014', 'trips / downtime this week', weekly.iob_downtime_min != null ? (weekly.iob_downtime_min > 60 ? 'red' : weekly.iob_downtime_min > 20 ? 'yellow' : 'green') : 'yellow');
    h += kpi('E-Stop Events', weekly.estop_downtime_min != null ? `${weekly.estop_events} / ${weekly.estop_downtime_min} min` : '\u2014', 'events / downtime this week', weekly.estop_downtime_min != null ? (weekly.estop_downtime_min > 120 ? 'red' : weekly.estop_downtime_min > 30 ? 'yellow' : 'green') : 'yellow');
    h += kpi('Sorter OTE', sorterOte != null ? `${sorterOte}%` : '\u2014', 'time running / total', sorterOte != null ? (sorterOte >= 95 ? 'green' : sorterOte >= 80 ? 'yellow' : 'red') : 'yellow');
    h += kpi('Sorter OEE', sorterOee != null ? `${sorterOee}%` : '\u2014', 'availability metric', sorterOee != null ? (sorterOee >= 95 ? 'green' : sorterOee >= 80 ? 'yellow' : 'red') : 'yellow');
    h += kpi('Downtime %', downtimePct != null ? `${downtimePct}%` : '\u2014', 'weekly', downtimePct != null ? (downtimePct > 5 ? 'red' : downtimePct > 2 ? 'yellow' : 'green') : 'yellow');
    // Chute Status
    const chutes = d.chutes || {};
    const chutesLocked = chutes.locked_out || 0;
    const chutesInhibited = chutes.inhibited || 0;
    const chutesJammed = chutes.jammed || 0;
    const chuteDown = chutesLocked + chutesInhibited + chutesJammed;
    h += kpi('Chutes Down', `${chuteDown} / 144`, 'Lane Non Operational', chuteDown > 50 ? 'red' : chuteDown > 20 ? 'yellow' : 'green');
    h += '</div>';

    // PPU Health
    h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> PPU Health \u2014 Vahle vPOWER (1\u20136)</div>';
    h += '<div class="health-grid">';
    ppuList.forEach(p => {
      let st = p.state || 'UNKNOWN';
      if (!running && st !== 'RUNNING') st = 'STOPPED';
      const color = st === 'RUNNING' ? 'green' : st === 'STOPPED' ? 'grey' : st === 'ERROR' ? 'red' : st === 'WARNING' ? 'yellow' : 'grey';
      const icon = st === 'RUNNING' ? '\u2713 Running' : st === 'STOPPED' ? '\u25a0 Stopped' : st === 'ERROR' ? '\u2717 ERROR' : st === 'WARNING' ? '\u26a0 WARN' : '\u2014 ' + st;
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
      const sub = '';  // MCB carrier tracked but not displayed
      const fltCount = (d.wpt_fault_counts || {})[String(pos.index)] || 0;
      let durStr = '';
      if (pos.error && (d.wpt_fault_start || {})[String(pos.index)]) {
        const mins = Math.round((Date.now() - new Date((d.wpt_fault_start)[String(pos.index)]).getTime()) / 60000);
        durStr = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
      }
      const extra = (fltCount > 0 || durStr) ? `<div style="font-size:9px;color:#7d8590;margin-top:2px;">${fltCount > 0 ? fltCount + 'x' : ''}${durStr ? ' \u23f1' + durStr : ''}</div>` : '';
      h += `<div class="health-cell ${color}"><div class="health-cell-label">[${pos.index}]</div><div class="health-cell-value ${color}">${icon}</div><div class="health-cell-sub">${label}</div>${sub ? `<div class="health-cell-sub">${sub}</div>` : ''}${extra}</div>`;
    });
    h += '</div>';
    // CTB/CRB Fault History
    const _fc = d.wpt_fault_counts || {};
    const _fp = Object.entries(_fc).filter(([k,v]) => v > 0).sort((a,b) => b[1] - a[1]);
    if (_fp.length > 0) {
      h += '<div style="margin-top:8px;padding:10px 12px;background:#161b22;border-radius:6px;border:1px solid #21262d;">';
      h += '<div style="font-size:10px;color:#7d8590;margin-bottom:6px;font-weight:600;">CTB/CRB Fault History</div>';
      h += '<table style="width:100%;font-size:11px;border-collapse:collapse;"><thead><tr><th style="text-align:left;color:#7d8590;padding:4px 8px;border-bottom:1px solid #21262d;">Position</th><th style="text-align:right;color:#7d8590;padding:4px 8px;border-bottom:1px solid #21262d;">Faults</th><th style="text-align:right;color:#7d8590;padding:4px 8px;border-bottom:1px solid #21262d;">Status</th></tr></thead><tbody>';
      _fp.forEach(([idx, count]) => {
        const isActive = wptList[Number(idx)] && wptList[Number(idx)].error;
        const badge = isActive ? '<span style="color:#f85149;font-weight:bold;">\u25cf ACTIVE</span>' : '<span style="color:#3fb950;">\u25cf Cleared</span>';
        h += `<tr><td style="padding:4px 8px;color:#c9d1d9;border-bottom:1px solid #1c2128;">[${idx}]</td><td style="padding:4px 8px;text-align:right;color:#f0883e;font-weight:bold;border-bottom:1px solid #1c2128;">${count}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #1c2128;">${badge}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';




    // ── Discharge CRBs (Belt Confirm Receivers 1–4) ──────────────────────
    const crbUnits = (crb.units || []);
    const crbFaulted = crbUnits.filter(u => u.connection_faulted).length;
    const crbColor = crb.master_alarm ? 'red' : crbFaulted > 0 ? 'yellow' : 'green';
    h += '<div class="section-panel"><div class="section-title">';
    h += '<span class="status-dot" style="background:var(--' + crbColor + ')"></span>';
    h += ' Discharge CRBs — Belt Confirm Receivers (1–4)</div>';
    h += '<div class="health-grid">';
    if (crbUnits.length > 0) {
      crbUnits.forEach(function(u) {
        const c2 = u.connection_faulted ? 'red' : 'green';
        const lbl = u.connection_faulted ? 'FAULTED' : 'OK';
        h += '<div class="health-cell ' + c2 + '">CRB ' + u.index + '<br><small>' + lbl + '</small></div>';
      });
    } else {
      h += '<div class="health-cell green">All 4 OK</div>';
    }
    h += '</div></div>';

    // Induction CTB/CRB Health (ActiveCTBCRB)
    var inductCTBCRB = d.induct_ctbcrb || {};
    var inductActive = (inductCTBCRB.active !== undefined) ? inductCTBCRB.active : null;
    var inductBoards = inductCTBCRB.boards || [];
    var inductTotal  = inductCTBCRB.total || 4;
    if (inductBoards.length > 0 || inductActive !== null) {
      var inductFaulted = inductBoards.filter(function(b) { return b.faulted; }).length;
      var iColor = inductFaulted > 0 ? 'red' : 'green';
      var iTitle = (inductActive !== null)
        ? ('Induction CTB/CRB Health (' + inductActive + ' of ' + inductTotal + ' active)')
        : 'Induction CTB/CRB Health';
      h += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--' + iColor + ')"></span>' + iTitle + '</div>';
      h += '<div class="health-grid">';
      if (inductBoards.length > 0) {
        inductBoards.forEach(function(b) {
          var bColor = b.faulted ? 'red' : 'green';
          var bIcon  = b.faulted ? '✗ FAULT' : '✓ OK';
          h += '<div class="health-cell ' + bColor + '"><div class="health-cell-label">' + b.label + '</div><div class="health-cell-value ' + bColor + '">' + bIcon + '</div></div>';
        });
      } else {
        var bTxt   = (inductActive !== null) ? (inductActive + ' / ' + inductTotal + ' active') : 'No data';
        var bColor = (inductActive !== null && inductActive < inductTotal) ? 'red' : 'green';
        h += '<div class="health-cell ' + bColor + '"><div class="health-cell-label">ActiveCTBCRB</div><div class="health-cell-value ' + bColor + '">' + bTxt + '</div></div>';
      }
      h += '</div></div>';
    }
    // LSM Drive Health
    if (lsmZones.length > 0) {
      const lsmFaults = lsmZones.filter(z => z.collision_detect || z.collision_avoid || z.vfd_fault).length;
      const lsmColor = lsmFaults > 0 ? 'yellow' : 'green';
      h += `<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--${lsmColor})"></span> LSM Drive Health (1\u201323)</div>`;
      h += '<div style="margin-bottom:10px;font-size:10px;color:var(--text-secondary);display:flex;gap:16px;"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:4px;"></span>CD = Collision Detection</span><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:4px;"></span>CA = Collision Avoidance</span><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-right:4px;"></span>VFD = Drive Fault</span></div>';
      h += '<div class="health-grid">';
      lsmZones.forEach(z => {
        const hasFault = z.collision_detect || z.collision_avoid || z.vfd_fault;
        const color = hasFault ? (z.vfd_fault ? 'red' : 'yellow') : 'green';
        const cdColor = z.collision_detect ? '#f85149' : '#3fb950';
        const caColor = z.collision_avoid ? '#f85149' : '#3fb950';
        const vfdColor = z.vfd_fault ? '#f85149' : '#3fb950';
        h += `<div class="health-cell ${color}">
          <div class="health-cell-label">LSM ${String(z.zone).padStart(2,'0')}</div>
          <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${cdColor};display:inline-block;"></span>
              <span style="color:var(--text-secondary);">CD</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${caColor};display:inline-block;"></span>
              <span style="color:var(--text-secondary);">CA</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${vfdColor};display:inline-block;"></span>
              <span style="color:var(--text-secondary);">VFD</span>
            </div>
          </div>
        </div>`;
      });
      h += '</div></div>';
    }

    // UCD Health (1-16)
    const ucdList = d.ucd || [];
    if (ucdList.length > 0) {
      const ucdFaults = ucdList.filter(u => u.ok === false).length;
      const ucdColor = ucdFaults > 0 ? 'yellow' : 'green';
      h += `<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--${ucdColor})"></span> UCD Health \u2014 Universal Carrier Detectors (1\u201316)</div>`;
      h += '<div class="health-grid">';
      ucdList.forEach(u => {
        const color = u.ok === true ? 'green' : u.ok === false ? 'red' : 'grey';
        const icon = u.ok === true ? '\u2713' : u.ok === false ? '\u2717' : '\u2014';
        const label = u.ok === true ? 'OK' : u.ok === false ? 'FAULT' : '?';
        h += `<div class="health-cell ${color}"><div class="health-cell-label">UCD ${u.index}</div><div class="health-cell-value ${color}">${icon}</div><div class="health-cell-sub">${label}</div></div>`;
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
    const sorter = d.sorter || {};
    const safety = d.safety_plc || {};
    const trace = d.trace || {};
    const zones = d.zones || [];
    const actions = d.priority_actions || [];
    const staleness = DataLayer.getStaleness(d);
    const total = d.carrier_count || 1882;
    const pidData = d.pids || {};
    const bypassData = d.bypass || {};

    const running = sorter.running || sorter.state === 'running';
    const wkNum = (() => { const d2=new Date(); const onejan=new Date(d2.getFullYear(),0,1); return Math.ceil((((d2-onejan)/86400000)+onejan.getDay()+1)/7); })();

    let h = '';

    // Header
    h += `<div class="detail-header">`;
    h += `<a href="sites.html" class="back-link">\u2190 Back to Fleet</a>`;
    h += `<span class="detail-site-id">${_siteId}</span>`;
    h += `<span class="site-card-oem oem-dem">DEM</span>`;
    h += `<span class="staleness-badge staleness-${staleness.status}">\u25cf ${staleness.label}</span>`;
    h += `</div>`;

    // Tab bar (matches RDU2 sub-tab style)
    h += `<div class="tab-bar" style="display:flex;gap:4px;margin:8px 0 16px 0;flex-wrap:wrap;">`;
    h += `<button class="filter-btn active" onclick="SiteDetail.showDemTab('overview')">Overview</button>`;
    h += `<button class="filter-btn" onclick="SiteDetail.showDemTab('pids')">PID Deck</button>`;
    h += `<button class="filter-btn" onclick="SiteDetail.showDemTab('bypass')">Bypass</button>`;
    h += `<button class="filter-btn" onclick="SiteDetail.showDemTab('trace')">Trace Codes</button>`;
    h += `</div>`;

    // Site info
    h += `<div style="font-size:11px;color:var(--text-secondary);margin:0 0 12px 0;">${_siteId} \u2014 10.225.139.140 | Wk${wkNum}</div>`;

    // Sorter banner
    const sorterStateStr = sorter.state || (running ? 'running' : 'stopped');
    const bannerColor = running ? 'var(--green)' : sorterStateStr === 'estopped' ? 'var(--red)' : 'var(--yellow)';
    const bannerText = running ? '\u25cf SORTER RUNNING' : sorterStateStr === 'estopped' ? '\u25cf SORTER E-STOPPED' : sorterStateStr === 'fault' ? '\u25cf SORTER FAULT' : '\u25cf SORTER STOPPED';
    h += `<div style="background:${bannerColor}15;border:1px solid ${bannerColor};border-radius:6px;padding:10px 16px;text-align:center;font-weight:700;color:${bannerColor};font-size:13px;margin-bottom:16px;">${bannerText}</div>`;

    // KPI Row 1
    const sortsHr = trace.sorts_per_hour || 0;
    const nonOpPct = trace.no_read_pct || 0;
    const recircPct = trace.recirc_pct || 0;
    const totalDiverted = trace.total_diverted || 0;
    const totalInducted = trace.total_inducted || 0;
    const chutesDown = trace.chutes_down_count || 0;
    const activeJams = trace.active_jams || 0;
    const carrierSD = trace.carrier_sd_trips_24h || 0;
    const multiRead = trace.multi_read_pct || 0;
    const successPct = trace.success_pct || 0;

    h += `<div class="kpi-row">`;
    h += demKpi('SORTS / HOUR', sortsHr.toLocaleString(), 'successful diverts/hr', 'green');
    h += demKpi('NON-OP %', nonOpPct.toFixed(2) + '%', 'chute unavailable', nonOpPct > 5 ? 'red' : nonOpPct > 3 ? 'yellow' : 'green');
    h += demKpi('RECIRC %', recircPct.toFixed(2) + '%', 'recirculation rate', recircPct > 60 ? 'red' : recircPct > 40 ? 'yellow' : 'green');
    h += demKpi('TOTAL INDUCTED', totalInducted.toLocaleString(), 'this shift', 'green');
    h += `</div>`;

    // KPI Row 2
    h += `<div class="kpi-row">`;
    h += demKpi('TOTAL DIVERTED', totalDiverted.toLocaleString(), 'this shift', 'green');
    h += demKpi('MULTI-READ %', multiRead.toFixed(2) + '%', 'Wk' + wkNum, multiRead > 3 ? 'red' : 'green');
    h += demKpi('SUCCESS %', successPct.toFixed(1) + '%', 'diverted / inducted', successPct > 40 ? 'green' : 'yellow');
    h += demKpi('CARRIER SD', carrierSD.toString(), 'trips / 24h', carrierSD > 20 ? 'red' : carrierSD > 5 ? 'yellow' : 'green');
    h += `</div>`;

    // KPI Row 3
    h += `<div class="kpi-row">`;
    h += demKpi('E-STOP EVENTS', (safety.estops_active || 0) + ' / 0 min', 'events / downtime', (safety.estops_active||0) > 0 ? 'red' : 'green');
    h += demKpi('GATES OPEN', (safety.gates_open || 0).toString(), 'safety gates open', (safety.gates_open||0) > 0 ? 'yellow' : 'green');
    h += demKpi('SAFETY DEVICES', safety.safdev_tripped > 0 ? 'TRIPPED' : 'OK', safety.safdev_tripped > 0 ? (safety.safdev_list||[]).join(', ') : 'series OK', safety.safdev_tripped > 0 ? 'red' : 'green');
    h += demKpi('CHUTES DOWN', chutesDown + ' / ' + (trace.chutes_down||[]).reduce((s,c)=>s+(c.count||0),0), 'non-op / total failures', chutesDown > 5 ? 'red' : chutesDown > 2 ? 'yellow' : 'green');
    h += `</div>`;

    // Zone Health
    h += `<div class="section-panel">`;
    h += `<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> ZONE HEALTH \u2014 SAFETY PLC (${zones.length} Zones)</div>`;
    h += `<div style="display:grid;grid-template-columns:repeat(${zones.length},1fr);gap:8px;">`;
    zones.forEach(z => {
      const ok = z.status === 'OK';
      const color = ok ? 'var(--green)' : 'var(--red)';
      h += `<div style="background:var(--bg-surface);border:1px solid ${color};border-radius:6px;padding:12px 8px;text-align:center;">`;
      h += `<div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${esc(z.id.replace('zone_','Zone '))}</div>`;
      h += `<div style="font-size:14px;color:${color};font-weight:700;">${ok ? '\u2713 Running' : '\u2717 ' + (z.faults||[]).join(', ')}</div>`;
      h += `<div style="font-size:9px;color:var(--text-secondary);margin-top:6px;">LSM: ${z.spc_ok?'\u2713':'\u2717'} | PWR: ${z.power_ok?'\u2713':'\u2717'} | ESTOP: ${z.estop?'\u2717':'\u2713'} | GATE: ${z.gate_open?'\u2717':'\u2713'}</div>`;
      h += `</div>`;
    });
    h += `</div></div>`;

    // Bypass quick view
    const northBp = bypassData.north || {};
    const southBp = bypassData.south || {};
    if (northBp.connected || southBp.connected) {
      h += `<div class="section-panel">`;
      h += `<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> BYPASS STATUS</div>`;
      h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
      [northBp, southBp].forEach(bp => {
        if (!bp.name) return;
        const jammed = bp.jam_active;
        const color = jammed ? 'var(--red)' : 'var(--green)';
        h += `<div style="background:var(--bg-surface);border:1px solid ${color};border-radius:6px;padding:12px;text-align:center;">`;
        h += `<div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">${bp.name}</div>`;
        h += `<div style="font-size:16px;color:${color};font-weight:700;">${jammed ? '\u2717 JAMMED' : '\u2713 CLEAR'}</div>`;
        if (jammed && bp.duration_min) h += `<div style="font-size:10px;color:var(--red);margin-top:4px;">${bp.duration_min.toFixed(0)} min</div>`;
        h += `</div>`;
      });
      h += `</div></div>`;
    }

    // PID quick summary
    const pidList = pidData.pids || [];
    const pidSummary = pidData.summary || {};
    if (pidList.length > 0) {
      h += `<div class="section-panel">`;
      h += `<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> PID HEALTH \u2014 SCAN TUNNELS (${pidSummary.pids_connected || 0}/${pidList.length})</div>`;
      h += `<div style="display:grid;grid-template-columns:repeat(${pidList.length},1fr);gap:6px;">`;
      pidList.forEach(pid => {
        const hasFault = pid.active_fault_count > 0;
        const color = !pid.connected ? 'var(--text-secondary)' : hasFault ? 'var(--red)' : 'var(--green)';
        const border = hasFault ? 'var(--red)' : pid.connected ? 'var(--green)' : 'var(--border)';
        h += `<div style="background:var(--bg-surface);border:1px solid ${border};border-radius:4px;padding:8px;text-align:center;">`;
        h += `<div style="font-size:9px;color:var(--text-secondary);">${pid.pid}</div>`;
        h += `<div style="font-size:13px;color:${color};font-weight:700;">${!pid.connected ? '?' : hasFault ? '\u2717' : '\u2713'} ${!pid.connected ? '?' : hasFault ? 'FAULT' : 'OK'}</div>`;
        h += `</div>`;
      });
      h += `</div></div>`;
    }

    // Priority Actions
    if (actions.length > 0) {
      h += `<div class="section-panel">`;
      h += `<div class="section-title"><span class="section-dot" style="background:var(--red)"></span> PRIORITY ACTIONS</div>`;
      actions.forEach((a, i) => {
        const sev = (a.severity || 'INFO').toUpperCase();
        const bg = sev === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : sev === 'WARNING' ? 'rgba(234,179,8,0.1)' : 'rgba(59,130,246,0.08)';
        const border = sev === 'CRITICAL' ? 'var(--red)' : sev === 'WARNING' ? 'var(--yellow)' : 'var(--blue)';
        h += `<div style="background:${bg};border-left:3px solid ${border};border-radius:4px;padding:10px 14px;margin-bottom:8px;">`;
        h += `<div style="font-size:12px;font-weight:700;color:var(--text-primary);">${i+1}. ${esc(a.text)}</div>`;
        if (a.component) h += `<div style="font-size:10px;color:var(--text-secondary);margin-top:3px;">${esc(a.component)}</div>`;
        h += `</div>`;
      });
      h += `</div>`;
    }

    // Live State Summary
    h += `<div class="section-panel">`;
    h += `<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> LIVE STATE SUMMARY</div>`;
    h += `<table class="data-table"><thead><tr><th>Parameter</th><th>Value</th><th style="text-align:right;">Status</th></tr></thead><tbody>`;
    h += demRow('Sorter State', running ? 'RUNNING' : (sorter.state || (sorter.running ? 'running' : 'stopped')).toUpperCase(), running);
    h += demRow('Contactor Enable', sorter.contactor_enable ? 'ENABLED' : 'OPEN', sorter.contactor_enable);
    h += demRow('LSM All Zones', sorter.lsm_all_ok ? 'ALL OK' : 'FAULT', sorter.lsm_all_ok);
    h += demRow('E-Stops Active', (safety.estops_active || 0).toString(), (safety.estops_active || 0) === 0);
    h += demRow('Gates Open', (safety.gates_open || 0).toString(), (safety.gates_open || 0) === 0);
    h += demRow('Safety Devices', safety.safdev_tripped > 0 ? 'TRIPPED' : 'OK', safety.safdev_tripped === 0);
    h += demRow('Non-Op Rate', nonOpPct.toFixed(2) + '%', nonOpPct < 5);
    h += demRow('Sorts/Hour', sortsHr.toLocaleString(), sortsHr > 0);
    h += demRow('North Bypass', northBp.jam_active ? 'JAMMED' : 'CLEAR', !northBp.jam_active);
    h += demRow('South Bypass', southBp.jam_active ? 'JAMMED' : 'CLEAR', !southBp.jam_active);
    h += demRow('PIDs Connected', (pidSummary.pids_connected||0) + '/' + pidList.length, (pidSummary.pids_connected||0) === pidList.length);
    h += `</tbody></table></div>`;

    return h;
  }

  function showDemTab(tab) {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) return;

    if (tab === 'overview') { render(result); return; }
    if (tab === 'pids') { renderDemPidTab(result); return; }
    if (tab === 'bypass') { renderDemBypassTab(result); return; }
    if (tab === 'trace') { renderDemTraceTab(result); return; }
  }

  function renderDemPidTab(d) {
    const container = document.getElementById('detail-content');
    const pidData = d.pids || {};
    const pidList = pidData.pids || [];
    const cc210Jams = pidData.cc210_jams || [];
    const pidSummary = pidData.summary || {};

    let h = '';
    h += `<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>`;

    // Summary KPIs
    h += `<div class="kpi-row">`;
    h += demKpi('PIDs CONNECTED', (pidSummary.pids_connected||0) + ' / ' + pidList.length, 'scan tunnels online', (pidSummary.pids_connected||0)===pidList.length ? 'green' : 'red');
    h += demKpi('ACTIVE FAULTS', (pidSummary.total_active_faults||0).toString(), 'across all PIDs', (pidSummary.total_active_faults||0)>0 ? 'red' : 'green');
    h += demKpi('RECV SORTER JAMS', (pidSummary.receive_sorter_jams||0).toString(), 'CC210 jam tags', (pidSummary.receive_sorter_jams||0)>0 ? 'red' : 'green');
    h += demKpi('WORST NR%', (pidSummary.worst_no_read_pct||0).toFixed(1) + '%', pidSummary.worst_no_read_pid || 'N/A', (pidSummary.worst_no_read_pct||0)>3 ? 'red' : 'green');
    h += `</div>`;

    // Per-PID detail cards
    h += `<div class="section-panel">`;
    h += `<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> PID SCAN TUNNEL DETAIL (6 PLCs)</div>`;
    pidList.forEach(pid => {
      const hasFault = pid.active_fault_count > 0;
      const border = hasFault ? 'var(--red)' : pid.connected ? 'var(--green)' : 'var(--border)';
      const cam = pid.verify_camera || {};
      h += `<div style="background:var(--bg-surface);border:1px solid ${border};border-radius:6px;padding:12px;margin-bottom:8px;">`;
      h += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
      h += `<div style="font-weight:700;font-size:13px;">${pid.pid} <span style="color:var(--text-secondary);font-size:10px;">(${pid.ip})</span></div>`;
      h += `<div style="font-size:12px;color:${hasFault?'var(--red)':'var(--green)'};font-weight:700;">${hasFault?'\u2717 '+pid.active_fault_count+' FAULT(S)':'\u2713 OK'}</div>`;
      h += `</div>`;
      if (hasFault) {
        h += `<div style="margin-top:6px;">`;
        pid.active_faults.forEach(f => {
          h += `<div style="font-size:11px;color:var(--red);padding:2px 0;">\u2022 ${f.friendly}</div>`;
        });
        h += `</div>`;
      }
      h += `<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;color:var(--text-secondary);">`;
      h += `<span>Total Reads: ${(cam.total_reads||0).toLocaleString()}</span>`;
      h += `<span>No-Reads: ${cam.no_reads||0}</span>`;
      h += `<span>Multi-Reads: ${cam.multi_reads||0}</span>`;
      h += `</div>`;
      h += `</div>`;
    });
    h += `</div>`;

    // CC210 Receive Sorter Jams
    h += `<div class="section-panel">`;
    h += `<div class="section-title"><span class="section-dot" style="background:var(--yellow)"></span> CC210 RECEIVE SORTER JAMS</div>`;
    h += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;">`;
    cc210Jams.forEach(j => {
      const color = j.jammed ? 'var(--red)' : 'var(--green)';
      const border = j.jammed ? 'var(--red)' : 'var(--border)';
      h += `<div style="background:var(--bg-surface);border:1px solid ${border};border-radius:4px;padding:8px;text-align:center;">`;
      h += `<div style="font-size:9px;color:var(--text-secondary);">${j.name}</div>`;
      h += `<div style="font-size:11px;color:${color};font-weight:700;">${j.jammed?'\u2717 JAMMED':'\u2713 OK'}</div>`;
      h += `<div style="font-size:8px;color:var(--text-secondary);">${j.pid}</div>`;
      h += `</div>`;
    });
    h += `</div></div>`;

    container.innerHTML = h;
  }

  function renderDemBypassTab(d) {
    const container = document.getElementById('detail-content');
    const bypassData = d.bypass || {};
    const north = bypassData.north || {};
    const south = bypassData.south || {};

    let h = '';
    h += `<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>`;

    h += `<div class="section-panel">`;
    h += `<div class="section-title"><span class="section-dot" style="background:var(--green)"></span> BYPASS JAM MONITOR \u2014 CC400 (10.225.139.91)</div>`;
    h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">`;

    [north, south].forEach(bp => {
      if (!bp.name) return;
      const jammed = bp.jam_active;
      const color = jammed ? 'var(--red)' : 'var(--green)';
      h += `<div style="background:var(--bg-surface);border:2px solid ${color};border-radius:8px;padding:20px;text-align:center;">`;
      h += `<div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">${bp.name}</div>`;
      h += `<div style="font-size:24px;color:${color};font-weight:700;">${jammed ? '\u2717 JAMMED' : '\u2713 CLEAR'}</div>`;
      if (jammed && bp.duration_min) {
        h += `<div style="font-size:14px;color:var(--red);margin-top:8px;">${bp.duration_min.toFixed(1)} min</div>`;
      }
      h += `<div style="font-size:10px;color:var(--text-secondary);margin-top:8px;">Jams (24h): ${bp.jam_count_24h || 0}</div>`;
      h += `</div>`;
    });

    h += `</div></div>`;
    container.innerHTML = h;
  }

  function renderDemTraceTab(d) {
    const container = document.getElementById('detail-content');
    const trace = d.trace || {};
    const s04 = trace.s04_codes || {};
    const chutesDown = trace.chutes_down || [];
    const inductFaults = trace.induct_faults_12h || [];

    let h = '';
    h += `<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>`;

    // S04 Code Breakdown
    h += `<div class="section-panel">`;
    h += `<div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> S04 SORT CODE BREAKDOWN</div>`;
    h += `<table class="data-table"><thead><tr><th>Code</th><th>Count</th><th>Meaning</th></tr></thead><tbody>`;
    const meanings = {'00':'Successful divert','01':'Empty carrier offload','05':'Recirculation','06':'Non-op chute','08':'Manual sort','10':'Multi-read','12':'No destination','13':'Overflow','14':'Failure to divert','21':'Bad position'};
    Object.entries(s04).sort((a,b) => b[1]-a[1]).forEach(([code, count]) => {
      const color = code==='00'?'color:var(--green)':code==='06'?'color:var(--red)':code==='05'?'color:var(--yellow)':'';
      h += `<tr><td style="${color};font-weight:700;">${code}</td><td style="${color}">${count.toLocaleString()}</td><td style="color:var(--text-secondary);font-size:11px;">${meanings[code]||'Unknown'}</td></tr>`;
    });
    h += `</tbody></table></div>`;

    // Chutes Down
    if (chutesDown.length > 0) {
      h += `<div class="section-panel">`;
      h += `<div class="section-title"><span class="section-dot" style="background:var(--yellow)"></span> NON-OP CHUTES (${chutesDown.length})</div>`;
      h += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;">`;
      chutesDown.forEach(c => {
        const sev = c.count>100?'red':c.count>20?'yellow':'green';
        h += `<div style="background:var(--bg-surface);border:1px solid var(--${sev});border-radius:4px;padding:6px;text-align:center;">`;
        h += `<div style="font-size:10px;color:var(--text-secondary);">M01${c.chute}</div>`;
        h += `<div style="font-size:12px;color:var(--${sev});font-weight:700;">${c.count}</div>`;
        h += `</div>`;
      });
      h += `</div></div>`;
    }

    // Induct Faults
    if (inductFaults.length > 0) {
      h += `<div class="section-panel">`;
      h += `<div class="section-title"><span class="section-dot" style="background:var(--yellow)"></span> INDUCT FAULTS (12h)</div>`;
      inductFaults.forEach(f => {
        h += `<div style="padding:4px 0;font-size:12px;border-bottom:1px solid var(--border-light);">${f.induct}: <b>${f.faults}x</b></div>`;
      });
      h += `</div>`;
    }

    container.innerHTML = h;
  }

  function demKpi(label, value, sub, color) {
    const c = color || 'green';
    return `<div class="kpi-card ${c}"><div class="kpi-label">${label}</div><div class="kpi-value ${c}">${value}</div><div class="kpi-subtitle">${sub}</div></div>`;
  }

  function demRow(param, value, ok) {
    const icon = ok ? '\u2713' : '\u26a0';
    const color = ok ? 'var(--green)' : 'var(--yellow)';
    return `<tr><td>${param}</td><td>${value}</td><td style="text-align:right;color:${color};">${icon}</td></tr>`;
  }

  function kpi(label, value, sub, color) {
    return `<div class="kpi-card ${color}"><div class="kpi-label">${label}</div><div class="kpi-value ${color}">${value}</div><div class="kpi-subtitle">${sub}</div></div>`;
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function showError(msg) { const c = document.getElementById('detail-content'); if(c) c.innerHTML = `<div class="error-banner">${msg} <a href="sites.html" style="color:var(--blue);margin-left:8px;">\u2190 Back</a></div>`; }

  function showShiftReport() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result || !result.shift_report) {
      container.innerHTML = '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Shift Report</div><p style="color:var(--text-secondary);font-size:13px;">No shift report available yet. Reports are generated at 7am and 7pm EST.</p></div>';
      return;
    }
    const sr = result.shift_report;

    // ── Collision events block ────────────────────────────────────────────
    const _collEvents = result.collision_events || [];
    const _stopCauses = result.sorter_stop_causes || [];
    let _extraHtml = '';

    if (_stopCauses.length > 0) {
      _extraHtml += '<div style="margin-bottom:12px;padding:10px 14px;background:rgba(248,81,73,0.08);border:1px solid var(--red);border-radius:8px;">';
      _extraHtml += '<div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;">&#9940; SORTER STOP CONDITIONS</div>';
      _stopCauses.forEach(c2 => {
        _extraHtml += '<div style="font-size:12px;color:var(--text-primary);padding:2px 0;">&#8226; '+c2+'</div>';
      });
      _extraHtml += '</div>';
    }

    if (_collEvents.length > 0) {
      _extraHtml += '<div style="margin-bottom:12px;padding:10px 14px;background:rgba(248,81,73,0.06);border:1px solid var(--red);border-radius:8px;">';
      _extraHtml += '<div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;">&#9889; COLLISION EVENTS — This Shift</div>';
      _extraHtml += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
      _extraHtml += '<tr style="color:var(--text-secondary);border-bottom:1px solid var(--border);">';
      _extraHtml += '<th style="text-align:left;padding:3px 6px;">TYPE</th><th style="text-align:left;padding:3px 6px;">ZONE</th><th style="text-align:left;padding:3px 6px;">LM</th><th style="text-align:left;padding:3px 6px;">CARRIER</th><th style="text-align:left;padding:3px 6px;">TIME</th></tr>';
      _collEvents.slice(-25).forEach(ev => {
        const typeCol = ev.type === 'CD' ? 'var(--red)' : 'var(--yellow)';
        _extraHtml += '<tr style="border-bottom:1px solid var(--border-subtle);">';
        _extraHtml += '<td style="padding:3px 6px;font-weight:700;color:'+typeCol+';">'+ev.type+'</td>';
        _extraHtml += '<td style="padding:3px 6px;">Zone '+ev.zone+'</td>';
        _extraHtml += '<td style="padding:3px 6px;">'+(ev.lm ? 'LM'+ev.lm : '—')+'</td>';
        _extraHtml += '<td style="padding:3px 6px;">CA-'+String(ev.carrier||0).padStart(4,'0')+'</td>';
        _extraHtml += '<td style="padding:3px 6px;color:var(--text-secondary);">'+(ev.time||'').slice(0,16)+'</td>';
        _extraHtml += '</tr>';
      });
      _extraHtml += '</table></div>';
    }
    let html = `<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>`;

    // Header card
    html += _extraHtml;
    html += `<div style="background:var(--bg-card);border:1px solid var(--blue);border-top:3px solid var(--blue);border-radius:8px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:28px;">\ud83d\udccb</span>
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary);">Shift Summary Report</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${esc(sr.shift_label || '')} \u2014 Generated ${esc(sr.generated_at || '')}</div>
        </div>
      </div>
    </div>`;

    // Parse sections
    const text = sr.text || '';
    const lines = text.split('\n');
    let sections = [];
    let current = null;

    lines.forEach(line => {
      const stripped = line.trim();
      if (!stripped) {
        if (current && current.items.length > 0) { sections.push(current); current = null; }
        return;
      }
      if (stripped.includes('TOP 10 MOST FREQUENT') || stripped.includes('FREQUENT JAMS')) {
        current = {title:'Top 10 Most Frequent Jams', icon:'\ud83d\udea8', color:'var(--red)', items:[]};
      } else if (stripped.includes('IOB TRIPS')) {
        current = {title:'IOB Trips', icon:'\u26a0\ufe0f', color:'var(--yellow)', items:[]};
      } else if (stripped.includes('SORTER FAULT')) {
        current = {title:'Sorter Faults', icon:'\u2699\ufe0f', color:'var(--green)', items:[]};
      } else if (stripped.includes('ESTOP DOWNTIME')) {
        current = {title:'E-Stop Downtime', icon:'\ud83d\uded1', color:'var(--red)', items:[]};
      } else if (stripped.includes('SCANNER REPORT')) {
        current = {title:'Scanner Report', icon:'\ud83d\udcf7', color:'var(--blue)', items:[]};
      } else if (stripped.includes('FAULTED CARRIER')) {
        current = {title:'Top Faulted Carriers', icon:'\ud83d\ude9a', color:'var(--orange)', items:[]};
      } else if (stripped.includes('CROSSBELT INDUCTION') || (stripped.includes('INDUCTION') && !stripped.includes('DIVERT'))) {
        current = {title:'Crossbelt Induction', icon:'\ud83d\udce6', color:'var(--green)', items:[]};
      } else if (stripped.includes('CROSSBELT DIVERT') || stripped.includes('DIVERTS')) {
        current = {title:'Crossbelt Diverts', icon:'\ud83d\udce4', color:'var(--blue)', items:[]};
      } else if (stripped.includes('CTB/CRB FAULT COUNT')) {
        current = {title:'CTB/CRB Fault Count', icon:'\ud83d\udd0c', color:'var(--orange)', items:[]};
      } else if (stripped.includes('WPT CTB/CRB HEALTH')) {
        current = {title:'WPT CTB/CRB Health Check', icon:'\ud83d\udd34', color:'var(--red)', items:[]};
      } else if (stripped.includes('DISCHARGE CTB COMM')) {
        current = {title:'Discharge CTB Comm Status', icon:'\ud83d\udce1', color:'var(--green)', items:[]};
      } else if (stripped.includes('LATE STARTUP AFTER DTW')) {
        current = {title:'Late Startup After DTW', icon:'\u23f1\ufe0f', color:'var(--yellow)', items:[]};
      } else if (stripped.includes('SHIFT SUMMARY') || stripped.includes('Day Shift') || stripped.includes('Night Shift') || stripped.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Skip header
      } else if (current) {
        current.items.push(stripped);
      }
    });
    if (current && current.items.length > 0) sections.push(current);

    // Render sections as nice cards
    sections.forEach(sec => {
      html += `<div style="background:var(--bg-card);border:1px solid var(--border);border-left:4px solid ${sec.color};border-radius:8px;padding:16px;margin-bottom:12px;">`;
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="font-size:16px;">${sec.icon}</span><span style="font-size:13px;font-weight:700;color:var(--text-primary);text-transform:uppercase;letter-spacing:0.03em;">${esc(sec.title)}</span></div>`;

      sec.items.forEach((item, idx) => {
        let style = 'padding:5px 0;font-size:12px;font-family:var(--font-mono);border-bottom:1px solid var(--border-light);';
        let textStyle = 'color:var(--text-primary)';

        // Style totals/summaries differently
        if (item.startsWith('\u2022') || item.includes('Total')) {
          style += 'padding-top:8px;margin-top:4px;border-top:1px solid var(--border);border-bottom:none;';
          textStyle = 'color:var(--text-secondary);font-weight:600;font-size:11px';
        }
        // Color code specific content
        if (item.includes('\u2705')) textStyle = 'color:var(--green);font-weight:600';
        if (item.includes('\u274c') || item.includes('FTD')) textStyle = 'color:var(--red)';
        if (item.includes('\u26a0')) textStyle = 'color:var(--yellow)';
        if (item.includes('\ud83d\udd04')) textStyle = 'color:var(--orange)';
        // Numbered items get subtle left padding
        if (item.match(/^\d+\./)) style += 'padding-left:8px;';

        // Last item no border
        if (idx === sec.items.length - 1) style += 'border-bottom:none;';

        html += `<div style="${style}"><span style="${textStyle}">${esc(item)}</span></div>`;
      });

      html += '</div>';
    });

    container.innerHTML = html;
  }

  function showSorterTab() {
  var container = document.getElementById('detail-content');
  if (!container) return;
  var d = DataLayer.getCachedData(_siteId) || {};
  var sim = d.simurgh || {};
  var snap = sim.carrier_snapshot || {};
  var reports = sim.recent_reports || [];
  var weekly = d.weekly || {};
  var mb = weekly.mhe_breakdown || {};

  var h = '<div class="tab-content-inner">';

  // Header
  h += '<div style="font-size:15px;font-weight:700;color:var(--yellow);margin-bottom:16px;">';
  h += '\uD83E\uDD85 MR.BOBB\'s Simurgh \u2014 IAH3 Loop Sorter Intelligence</div>';

  // Carrier snapshot KPIs
  h += '<div class="section-panel"><div class="section-title">';
  h += '<span class="section-dot" style="background:var(--blue)"></span>';
  h += 'Carrier Fleet Snapshot (EDRO)</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
  var errCount = snap.error_count !== undefined ? snap.error_count : (d.carriers || {}).faulted || 0;
  var disCount = snap.disabled_count !== undefined ? snap.disabled_count : (d.carriers || {}).disabled || 0;
  var recirc   = snap.recirculating_count || 0;
  var occupied = snap.occupied_count || 0;
  var total    = (d.carrier_count || 2340);
  h += kpi('Error Carriers', errCount, 'MCB / comm fault', errCount > 50 ? 'red' : errCount > 20 ? 'yellow' : 'green');
  h += kpi('Disabled Carriers', disCount, 'manually taken out', disCount > 50 ? 'red' : disCount > 20 ? 'yellow' : 'green');
  h += kpi('Recirculating', recirc, 'on loop right now', recirc > 500 ? 'red' : recirc > 200 ? 'yellow' : 'green');
  h += kpi('Occupied', occupied, 'carrying items', 'blue');
  h += '</div></div>';

  // ICW MHE breakdown
  if (Object.keys(mb).length > 0) {
    var noAct  = mb.NoActivation || 0;
    var laneFull = mb.LaneFull || 0;
    var laneBlk  = mb.LaneBlocked || 0;
    var maxRec   = mb.MaxRecirculation || 0;
    var itemScn  = mb.ItemScanned || 0;
    var ok       = mb.Ok || 0;
    var total_ev = (mb.ItemScanned || 0);
    h += '<div class="section-panel"><div class="section-title">';
    h += '<span class="section-dot" style="background:var(--red)"></span>';
    h += 'Simurgh \u2014 ICW Event Breakdown</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
    h += kpi('No Activation (FTD)', noAct.toLocaleString(), 'carrier belt didn\'t fire', noAct > 10000 ? 'red' : noAct > 3000 ? 'yellow' : 'green');
    h += kpi('Lane Full', laneFull.toLocaleString(), 'chute at capacity', laneFull > 500000 ? 'red' : laneFull > 100000 ? 'yellow' : 'green');
    h += kpi('Lane Blocked', laneBlk.toLocaleString(), 'jam or fault', laneBlk > 50000 ? 'red' : 'green');
    h += kpi('Max Recirc', maxRec.toLocaleString(), 'hit limit (' + (d.config || {}).max_recirc + ')', maxRec > 100000 ? 'red' : maxRec > 30000 ? 'yellow' : 'green');
    h += '</div></div>';
  }

  // Simurgh report history
  if (reports.length > 0) {
    h += '<div class="section-panel"><div class="section-title">';
    h += '<span class="section-dot" style="background:var(--green)"></span>';
    h += 'Recent Simurgh Reports</div>';
    h += '<table style="width:100%;font-size:11px;border-collapse:collapse;">';
    h += '<thead><tr>';
    h += '<th style="text-align:left;color:#7d8590;padding:4px 8px;border-bottom:1px solid #21262d;">Time</th>';
    h += '<th style="text-align:left;color:#7d8590;padding:4px 8px;border-bottom:1px solid #21262d;">Report</th>';
    h += '<th style="text-align:left;color:#7d8590;padding:4px 8px;border-bottom:1px solid #21262d;">Summary</th>';
    h += '</tr></thead><tbody>';
    reports.slice(0, 15).forEach(function(r) {
      h += '<tr>';
      h += '<td style="padding:4px 8px;color:#7d8590;border-bottom:1px solid #1c2128;font-size:10px;">' + (r.time || '') + '</td>';
      h += '<td style="padding:4px 8px;font-weight:600;border-bottom:1px solid #1c2128;">' + (r.name || '') + '</td>';
      h += '<td style="padding:4px 8px;color:#c9d1d9;border-bottom:1px solid #1c2128;">' + (r.summary || '') + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  } else {
    h += '<div class="section-panel" style="color:var(--text-secondary);font-size:12px;">';
    h += '\uD83E\uDD85 Simurgh is running on the site PC.<br>';
    h += 'Reports go to <b>#iah3-ops-simurgh-reporting</b> and <b>#iah3-rme-simurgh-reporting</b> Slack channels.<br><br>';
    h += 'Schedule:<br>';
    h += '&bull; Every 15 min: Carrier failed divert / max recirc / stuck item alerts<br>';
    h += '&bull; Every 15 min: EDRO carrier snapshot (Error, Disabled, Recirculating, Occupied)<br>';
    h += '&bull; Every 6 hours: Lost Packages Top 15<br>';
    h += '&bull; Every 12 hours: Motor Not Running Top 15 + Manually Disabled Carriers<br>';
    h += '&bull; 5:30 AM/PM and 7:00 AM/PM: Full EDRO carrier report<br><br>';
    h += '<b>Alert thresholds:</b> 10 failed diverts, 10 max recircs, 50 lane blocked, 100 lane full+disabled<br>';
    h += '</div>';
  }

  h += '</div>';
  container.innerHTML = h;
}

  function showMetricsTab() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) { container.innerHTML = '<div class="section-panel"><p style="color:var(--text-secondary)">No data.</p></div>'; return; }
    const weekly = result.weekly || {};
    const breakdown = weekly.mhe_breakdown || {};
    const daily = weekly.daily_defects || [];

    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>';

    // MHE Defect Summary KPIs
    const ok = breakdown.Ok || 0;
    const ftd = breakdown.NoActivation || 0;
    const gapError = breakdown.TrayspacingHorizontal || 0;
    const laneNonOp = breakdown.LaneBlocked || 0;
    const utd = breakdown.ItemOnActivatedCarrier || 0;
    const laneFull = breakdown.LaneFull || 0;
    const noRead = breakdown.NoAnswerFromScanner || 0;
    const scanDefectPct = weekly.scan_defect_pct || 0;
    const scanEventCount = Math.round((scanDefectPct / 100) * (breakdown.ItemScanned || 0));
    const maxRecirc = breakdown.MaxRecirculation || 0;
    // MySPD MHE Defect = FTD + Gap Error + Lane Non-Op + UTD
    const mheTotal = ftd + gapError + laneNonOp + utd;
    // Denominator = all sort outcomes (exclude ItemScanned + CodeUsed)
    const sortDenom = Object.entries(breakdown).filter(([k]) => k !== 'ItemScanned' && k !== 'CodeUsed').reduce((s,[,v]) => s + v, 0);
    const mhePct = sortDenom > 0 ? (mheTotal / sortDenom * 100).toFixed(2) : 0;
    const ftdPct = sortDenom > 0 ? (ftd / sortDenom * 100).toFixed(2) : 0;
    const gapPct = sortDenom > 0 ? (gapError / sortDenom * 100).toFixed(2) : 0;
    const laneNonOpPct = sortDenom > 0 ? (laneNonOp / sortDenom * 100).toFixed(2) : 0;
    const utdPct = sortDenom > 0 ? (utd / sortDenom * 100).toFixed(2) : 0;

    html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--red)"></span> MHE Defect Breakdown (Weekly)</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    html += `<div class="kpi-card red"><div class="kpi-label">MHE Defect Total</div><div class="kpi-value red">${mhePct}%</div><div class="kpi-subtitle">${mheTotal.toLocaleString()} events</div></div>`;
    html += `<div class="kpi-card red"><div class="kpi-label">Failed to Divert</div><div class="kpi-value red">${ftd.toLocaleString()}</div><div class="kpi-subtitle">${ftdPct}%</div></div>`;
    html += `<div class="kpi-card yellow"><div class="kpi-label">Gap Error</div><div class="kpi-value yellow">${gapError.toLocaleString()}</div><div class="kpi-subtitle">${gapPct}%</div></div>`;
    html += `<div class="kpi-card yellow"><div class="kpi-label">Lane Non-Op</div><div class="kpi-value yellow">${laneNonOp.toLocaleString()}</div><div class="kpi-subtitle">${laneNonOpPct}%</div></div>`;
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    html += `<div class="kpi-card yellow"><div class="kpi-label">Unable to Divert</div><div class="kpi-value yellow">${utd.toLocaleString()}</div><div class="kpi-subtitle">${utdPct}%</div></div>`;
    html += `<div class="kpi-card blue"><div class="kpi-label">Lane Full (Ops)</div><div class="kpi-value blue">${laneFull.toLocaleString()}</div><div class="kpi-subtitle">Ops Defect</div></div>`;
    html += `<div class="kpi-card blue"><div class="kpi-label">Scan Defect</div><div class="kpi-value blue">${scanDefectPct.toFixed(1)}%</div><div class="kpi-subtitle">${scanEventCount.toLocaleString()} events</div></div>`;
    html += `<div class="kpi-card grey"><div class="kpi-label">Max Recirc</div><div class="kpi-value grey">${maxRecirc.toLocaleString()}</div><div class="kpi-subtitle">Load Balance</div></div>`;
    html += '</div>';

    // Full breakdown table
    html += '<table class="data-table"><thead><tr><th>Reason</th><th>Count</th><th>% of Total</th><th>Impact</th></tr></thead><tbody>';
    const sorted = Object.entries(breakdown).sort((a,b) => b[1] - a[1]);
    const grandTotal = sorted.reduce((s,e) => s + e[1], 0);
    sorted.forEach(([reason, count]) => {
      const pct = grandTotal > 0 ? (count / grandTotal * 100).toFixed(2) : 0;
      let impact = '';
      const mheCodes = ['NoActivation','TrayspacingHorizontal','ItemOnActivatedCarrier','LaneBlocked','LaneJammed'];
      const scanCodes = ['NoAnswerFromScanner','NotCodeConverted','MultipleBarcode'];
      const opsCodes = ['LaneFull','LaneUnavailable','LaneDisabled'];
      const loadCodes = ['MaxRecirculation','SorterSpeedChange','ThroughputLimit'];
      if (mheCodes.includes(reason)) impact = '<span class="badge-fault">MHE DEFECT</span>';
      else if (scanCodes.includes(reason)) impact = '<span style="background:#1a3a5c;color:#58a6ff;padding:2px 6px;border-radius:4px;font-size:10px;">SCAN DEFECT</span>';
      else if (reason === 'Ok' || reason === 'ItemScanned' || reason === 'CodeUsed') impact = '<span class="badge-ok">GOOD</span>';
      else if (opsCodes.includes(reason)) impact = '<span style="background:#3b2e00;color:#d29922;padding:2px 6px;border-radius:4px;font-size:10px;">OPS DEFECT</span>';
      else if (loadCodes.includes(reason)) impact = '<span style="background:#2d1f3d;color:#bc8cff;padding:2px 6px;border-radius:4px;font-size:10px;">LOAD BALANCE</span>';
      else impact = '<span style="color:var(--text-secondary)">Other</span>';
      html += `<tr><td style="font-family:var(--font-mono)">${reason}</td><td style="font-weight:600">${count.toLocaleString()}</td><td>${pct}%</td><td>${impact}</td></tr>`;
    });
    html += '</tbody></table></div>';

    // Top 10 Chutes by Failed to Divert
    const topFtdChutes = weekly.top_ftd_chutes || [];
    if (topFtdChutes.length > 0) {
      html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--red)"></span> Top 10 Chutes \u2014 Failed to Divert</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      topFtdChutes.forEach(ch => {
        const bg = ch.fail_pct > 80 ? 'var(--red-bg)' : ch.fail_pct > 50 ? 'var(--yellow-bg)' : 'var(--bg-surface)';
        const border = ch.fail_pct > 80 ? 'var(--red)' : ch.fail_pct > 50 ? 'var(--yellow)' : 'var(--border)';
        html += `<div style="background:${bg};border:1px solid ${border};border-radius:6px;padding:4px 8px;font-size:11px;font-family:var(--font-mono);"><span style="font-weight:700;">${ch.name}</span> <span style="color:var(--text-secondary);">${ch.ftd.toLocaleString()}</span></div>`;
      });
      html += '</div></div>';
    }

    // Daily trend
    if (daily.length > 0) {
      html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--orange)"></span> Daily Defect Trend (7 days)</div>';
      html += '<table class="data-table"><thead><tr><th>Date</th><th>FTD</th><th>Good Diverts</th><th>Lane Full</th><th>No Read</th><th>UTD</th><th>FTD%</th></tr></thead><tbody>';
      daily.forEach(d => {
        const dayTotal = d.ftd + d.good + d.lane_full;
        const dayFtdPct = dayTotal > 0 ? (d.ftd / dayTotal * 100).toFixed(2) : '0';
        const ftdColor = d.ftd > 5000 ? 'color:var(--red)' : d.ftd > 3000 ? 'color:var(--yellow)' : '';
        html += `<tr><td>${d.date}</td><td style="font-weight:600;${ftdColor}">${d.ftd.toLocaleString()}</td><td style="color:var(--green)">${d.good.toLocaleString()}</td><td>${d.lane_full.toLocaleString()}</td><td>${d.no_read.toLocaleString()}</td><td>${d.utd.toLocaleString()}</td><td style="${ftdColor}">${dayFtdPct}%</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    container.innerHTML = html;
  }

  function showChuteJamsTab() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) { container.innerHTML = '<div class="section-panel"><p style="color:var(--text-secondary)">No data.</p></div>'; return; }
    const jams = result.active_jams || {};

    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>';

    // 2x2 grid
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

    const boxes = [
      {key:'north_upper', title:'RME Chute Jam Upper (Northside)', color:'var(--red)', border:'var(--red)'},
      {key:'south_upper', title:'RME Chute Jam Upper (Southside)', color:'var(--orange)', border:'var(--orange)'},
      {key:'north_lower', title:'Ops Chute Jam Lower (Northside)', color:'var(--yellow)', border:'var(--yellow)'},
      {key:'south_lower', title:'Ops Chute Jam Lower (Southside)', color:'var(--blue)', border:'var(--blue)'},
    ];

    boxes.forEach(box => {
      const items = jams[box.key] || [];
      html += `<div style="background:var(--bg-card);border:1px solid var(--border);border-top:3px solid ${box.border};border-radius:8px;padding:24px;min-height:250px;">`;
      html += `<div style="font-size:14px;font-weight:700;color:${box.color};margin-bottom:14px;">${box.title}</div>`;
      if (items.length > 0) {
        html += `<div style="font-size:10px;color:var(--text-secondary);margin-bottom:6px;">${items.length} active jam(s)</div>`;
        items.forEach(j => {
          const durColor = j.duration_min > 60 ? 'var(--red)' : j.duration_min > 15 ? 'var(--yellow)' : 'var(--text-primary)';
          const flash = j.duration_min > 10 ? 'animation:fault-flash 1s infinite;' : '';
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:5px;background:${j.duration_min > 10 ? 'var(--red-bg)' : 'var(--bg-surface)'};border-radius:4px;border-left:3px solid ${durColor};${flash}">
            <span style="font-size:12px;font-family:var(--font-mono);font-weight:600;">${j.name}</span>
            <span style="font-size:12px;font-weight:700;color:${durColor};">${j.duration_min} min</span>
          </div>`;
        });
      } else {
        html += '<div style="text-align:center;padding:16px;color:var(--green);font-size:11px;">\u2713 No active jams</div>';
      }
      html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  function showInboundTab() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) { container.innerHTML = '<div class="section-panel"><p style="color:var(--text-secondary)">No data.</p></div>'; return; }
    const jams = result.active_inbound_jams || {};

    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>';

    // Side by side CP01 / CP02
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

    const boxes = [
      {key:'cp01', title:'CP01 Inbound Jams (Receiving South)', color:'var(--yellow)', border:'var(--yellow)'},
      {key:'cp02', title:'CP02 Inbound Jams (Receiving North)', color:'var(--orange)', border:'var(--orange)'},
    ];

    boxes.forEach(box => {
      const items = jams[box.key] || [];
      html += `<div style="background:var(--bg-card);border:1px solid var(--border);border-top:3px solid ${box.border};border-radius:8px;padding:24px;min-height:250px;">`;
      html += `<div style="font-size:14px;font-weight:700;color:${box.color};margin-bottom:14px;">${box.title}</div>`;
      if (items.length > 0) {
        html += `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">${items.length} active jam(s)</div>`;
        items.forEach(j => {
          const durColor = j.duration_min > 60 ? 'var(--red)' : j.duration_min > 15 ? 'var(--yellow)' : 'var(--text-primary)';
          const flash = j.duration_min > 10 ? 'animation:fault-flash 1s infinite;' : '';
          html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:5px;background:${j.duration_min > 10 ? 'var(--red-bg)' : 'var(--bg-surface)'};border-radius:4px;border-left:3px solid ${durColor};${flash}">
            <span style="font-size:12px;font-family:var(--font-mono);font-weight:600;">${j.name}</span>
            <span style="font-size:12px;font-weight:700;color:${durColor};">${j.duration_min} min</span>
          </div>`;
        });
      } else {
        html += '<div style="text-align:center;padding:20px;color:var(--green);font-size:12px;">\u2713 No active jams</div>';
      }
      html += '</div>';
    });

    html += '</div>';
    html += '<style>@keyframes fault-flash{0%,100%{opacity:1}50%{opacity:0.4}}</style>';
    container.innerHTML = html;
  }

  function renderJamList(items, title, color) {
    let html = `<div style="background:var(--bg-card);border:1px solid var(--border);border-top:3px solid ${color};border-radius:8px;padding:24px;min-height:300px;">`;
    html += `<div style="font-size:14px;font-weight:700;color:${color};margin-bottom:14px;">${title}</div>`;
    if (items.length > 0) {
      html += `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">${items.length} active jam(s)</div>`;
      items.forEach(j => {
        const durColor = j.duration_min > 60 ? 'var(--red)' : j.duration_min > 15 ? 'var(--yellow)' : 'var(--text-primary)';
        const flash = j.duration_min > 10 ? 'animation:fault-flash 1s infinite;' : '';
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:5px;background:${j.duration_min > 10 ? 'var(--red-bg)' : 'var(--bg-surface)'};border-radius:4px;border-left:3px solid ${durColor};${flash}">
          <span style="font-size:12px;font-family:var(--font-mono);font-weight:600;">${j.name}</span>
          <span style="font-size:12px;font-weight:700;color:${durColor};">${j.duration_min} min</span>
        </div>`;
      });
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--green);font-size:12px;">\u2713 No active jams</div>';
    }
    html += '</div>';
    return html;
  }

  function showOutboundSouth() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) return;
    const items = result.active_outbound_south || [];
    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>';
    html += renderJamList(items, 'Southside Outbound Jams', 'var(--yellow)');
    html += '<style>@keyframes fault-flash{0%,100%{opacity:1}50%{opacity:0.4}}</style>';
    container.innerHTML = html;
  }

  function showOutboundNorth() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) return;
    const items = result.active_outbound_north || [];
    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>';
    html += renderJamList(items, 'Northside Outbound Jams', 'var(--orange)');
    html += '<style>@keyframes fault-flash{0%,100%{opacity:1}50%{opacity:0.4}}</style>';
    container.innerHTML = html;
  }

  function showShoeSorter() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) return;
    const ss = result.shoe_sorter || {};
    const icw = ss.icw_stats || {};
    // ── Throughput KPIs from CP67 OEE MP counters ──────────────────────────
    const mergeTotal  = ss.merge_total  || 0;
    const sortTotal   = ss.sort_total   || 0;
    const inductTotal = ss.induct_total || 0;
    const grandTotal  = ss.total        || (mergeTotal + sortTotal);
    const mpRows      = ss.mp_rows      || [];
    const aglOn       = ss.agl_enabled;
    const inductJam   = ss.induct_jam;
    const exitJam     = ss.exit_jam;
    const gridlock    = ss.gridlock;
    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">← Back to Overview</button></div>';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:5px;border-bottom:1px solid var(--border);">������ Shoe Sorter — IntelliSort / IntelliMerge (CP67)</div>';
    // Status row
    const statusItems = [
      {label:'AGL', ok: aglOn, okLabel:'ON', badLabel:'OFF'},
      {label:'Induct Jam', ok: !inductJam, okLabel:'Clear', badLabel:'ACTIVE'},
      {label:'Exit Jam',   ok: !exitJam,   okLabel:'Clear', badLabel:'ACTIVE'},
      {label:'Gridlock',   ok: !gridlock,  okLabel:'Clear', badLabel:'ACTIVE'},
    ];
    html += '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">';
    statusItems.forEach(s => {
      const color = s.ok ? 'var(--green)' : 'var(--red)';
      const bg    = s.ok ? 'var(--green-bg)' : 'var(--red-bg)';
      html += `<div style="background:${bg};border:1px solid ${color};border-radius:6px;padding:6px 12px;font-size:11px;font-weight:600;color:${color};">${s.label}: ${s.ok ? s.okLabel : s.badLabel}</div>`;
    });
    html += '</div>';
    // Throughput KPI cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    html += kpi('Total Through Sorter', grandTotal ? Number(grandTotal).toLocaleString() : '—', 'merge + sort lanes', grandTotal > 0 ? 'green' : 'grey');
    html += kpi('IntelliMerge Total',   mergeTotal ? Number(mergeTotal).toLocaleString()  : '—', 'packages merged in', mergeTotal > 0 ? 'green' : 'grey');
    html += kpi('After-Sort Output',    sortTotal  ? Number(sortTotal).toLocaleString()   : '—', 'back to sorter lanes', sortTotal > 0 ? 'green' : 'grey');
    html += kpi('Re-Inducted CB4000',   inductTotal? Number(inductTotal).toLocaleString() : '—', 'onto crossbelt', inductTotal > 0 ? 'blue' : 'grey');
    html += '</div>';
    // MP detail table
    if (mpRows.length > 0) {
      html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Machine Point Detail (CP67)</div>';
      html += '<table class="data-table"><thead><tr><th>Machine Point</th><th style="text-align:right;">Good Diverts</th><th style="text-align:right;">FTD</th><th style="text-align:right;">Lane Full</th></tr></thead><tbody>';
      mpRows.forEach(row => {
        const ftdColor = row.ftd > 100 ? 'color:var(--red)' : '';
        html += `<tr><td style="font-family:var(--font-mono)">${row.mp}</td><td style="text-align:right;font-weight:600">${Number(row.good).toLocaleString()}</td><td style="text-align:right;${ftdColor}">${Number(row.ftd).toLocaleString()}</td><td style="text-align:right">${Number(row.lane_full).toLocaleString()}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">\u2190 Back to Overview</button></div>';
    html += `<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:5px;border-bottom:1px solid var(--border);">\ud83d\udc5f Shoe Sorter \u2014 CP67 / CP68 (Main Router)</div>`;

    // Induct Statistics KPIs
    html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Induct Statistics</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
    html += kpi('Total Inducted', (icw.total_inducted || 0).toLocaleString(), 'this week', 'green');
    html += kpi('Total Diverted', (icw.total_diverted || 0).toLocaleString(), 'this week', 'green');
    const recirc = (icw.lane_full || 0) + (icw.max_recirc || 0);
    const recircPct2 = icw.total_inducted > 0 ? (recirc / icw.total_inducted * 100).toFixed(1) : '0';
    html += kpi('Recirculation', recirc.toLocaleString(), `${recircPct2}%`, recirc > 100000 ? 'yellow' : 'green');
    html += kpi('Peak CPM', String(icw.peak_cpm || 0), 'cartons/min', 'blue');
    html += '</div></div>';

    // MHE Statistics KPIs
    html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--red)"></span> MHE Statistics</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">';
    html += kpi('No Activation (FTD)', (icw.no_activation || 0).toLocaleString(), 'failed to divert', icw.no_activation > 1000 ? 'red' : 'yellow');
    html += kpi('Lane Full', (icw.lane_full || 0).toLocaleString(), 'chute at capacity', icw.lane_full > 100000 ? 'red' : 'yellow');
    html += kpi('Lane Blocked', (icw.lane_blocked || 0).toLocaleString(), 'WCS blocked', icw.lane_blocked > 50000 ? 'yellow' : 'green');
    html += kpi('No Scanner Read', (icw.no_read || 0).toLocaleString(), 'scan defect', icw.no_read > 5000 ? 'red' : 'yellow');
    html += kpi('Max Recirculation', (icw.max_recirc || 0).toLocaleString(), 'hit limit', icw.max_recirc > 50000 ? 'red' : 'yellow');
    html += kpi('Speed Change', (icw.speed_change || 0).toLocaleString(), 'sorter speed issues', 'yellow');
    html += kpi('Induct Jam', ss.induct_jam ? 'ACTIVE' : 'OK', '', ss.induct_jam ? 'red' : 'green');
    html += kpi('AGL Enabled', ss.agl_enabled ? 'ACTIVE' : 'OFF', 'auto gridlock', ss.agl_enabled ? 'yellow' : 'green');
    html += '</div></div>';

    // Live Status
    html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Live Jam Status</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
    const jInduct = ss.induct_jam;
    const jMiddle = ss.middle_jam;
    const jExit = ss.exit_jam;
    html += `<div class="health-cell ${jInduct ? 'red' : 'green'}"><div class="health-cell-label">Induct</div><div class="health-cell-value ${jInduct ? 'red' : 'green'}">${jInduct ? '\u2717 JAM' : '\u2713 OK'}</div></div>`;
    html += `<div class="health-cell ${jMiddle ? 'red' : 'green'}"><div class="health-cell-label">Middle</div><div class="health-cell-value ${jMiddle ? 'red' : 'green'}">${jMiddle ? '\u2717 JAM' : '\u2713 OK'}</div></div>`;
    html += `<div class="health-cell ${jExit ? 'red' : 'green'}"><div class="health-cell-label">Exit</div><div class="health-cell-value ${jExit ? 'red' : 'green'}">${jExit ? '\u2717 JAM' : '\u2713 OK'}</div></div>`;
    html += '</div></div>';

    // Profibus Health Grid
    const nodes = ss.profibus_nodes || [];
    const profiFaulted = nodes.filter(n => n.ok === false).length;
    const profiColor = profiFaulted > 0 ? 'yellow' : 'green';
    html += `<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--${profiColor})"></span> Profibus Slave Health (CP68 Nodes)</div>`;
    html += '<div style="margin-bottom:8px;font-size:10px;color:var(--text-secondary);">\u25cf Green = communicating | \u25cf Red = fault</div>';
    html += '<div class="health-grid">';
    nodes.forEach(n => {
      const color = n.ok === true ? 'green' : n.ok === false ? 'red' : 'grey';
      const icon = n.ok === true ? '\u2713' : n.ok === false ? '\u2717' : '\u2014';
      html += `<div class="health-cell ${color}"><div class="health-cell-label">${n.name}</div><div class="health-cell-value ${color}">${icon}</div></div>`;
    });
    html += '</div></div>';

    // Active zone jams
    const zoneJams = ss.jams || [];
    if (zoneJams.length > 0) {
      html += '<div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--red)"></span> Active Zone Jams</div>';
      zoneJams.forEach(j => {
        html += `<div style="padding:8px 12px;margin-bottom:5px;background:var(--red-bg);border-radius:4px;border-left:3px solid var(--red);animation:fault-flash 1s infinite;font-size:12px;font-weight:600;color:var(--red);">${j}</div>`;
      });
      html += '</div>';
    }

    html += '<style>@keyframes fault-flash{0%,100%{opacity:1}50%{opacity:0.4}}</style>';
    container.innerHTML = html;
  }


  function showFrontOfBuilding() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId);
    if (!result) return;
    const items = result.active_front_of_building || [];
    let html = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">&#8592; Back to Overview</button></div>';
    html += `<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:5px;border-bottom:1px solid var(--border);">&#127970; Front of Building Jams &mdash; Shoe Sorter / SIPS-ATAC / Jackpots</div>`;
    html += renderJamList(items, 'Active Jams &mdash; Front of Building (Shoe Sorter + SIPS/ATAC + Jackpots)', 'var(--red)');
    html += '<style>@keyframes fault-flash{0%,100%{opacity:1}50%{opacity:0.4}}</style>';
    container.innerHTML = html;
  }



  function showIah3LizardTab() {
    const container = document.getElementById('detail-content');
    if (!container) return;
    const result = DataLayer.getCachedData(_siteId) || {};
    const lz = result.iah3_lizard || {};
    const webhook = lz.webhook || '';
    const alarms  = lz.alarms  || [];
    const events  = result.collision_events || [];
    const stops   = result.sorter_stop_causes || [];

    let h = '<div style="margin-bottom:12px;"><button class="filter-btn" onclick="SiteDetail.refresh()">&#8592; Back to Overview</button></div>';
    h += '<div style="font-size:16px;font-weight:700;color:var(--yellow);margin-bottom:14px;">&#128994; IAH3 Lizard — Slack Chat</div>';

    // ── Webhook config card ───────────────────────────────────────────────
    h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:14px;">';
    h += '<div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;letter-spacing:0.05em;">SLACK WEBHOOK</div>';
    if (webhook) {
      h += '<div style="font-size:11px;color:var(--green);word-break:break-all;background:var(--bg-secondary);padding:8px 10px;border-radius:4px;font-family:monospace;">' + webhook + '</div>';
      h += '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Posts automatically when CD/CA trips or sorter stops. Managed by iah3_fleet_push.py.</div>';
    } else {
      h += '<div style="font-size:12px;color:var(--text-secondary);">No webhook configured — set IAH3_LIZARD_WEBHOOK in iah3_fleet_push.py</div>';
    }
    h += '</div>';

    // ── Active stop conditions ────────────────────────────────────────────
    if (stops.length > 0) {
      h += '<div style="background:rgba(248,81,73,0.08);border:1px solid var(--red);border-radius:8px;padding:14px;margin-bottom:14px;">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:8px;">&#9940; ACTIVE SORTER STOP CONDITIONS</div>';
      stops.forEach(s => {
        h += '<div style="font-size:12px;color:var(--text-primary);padding:3px 0;">&#8226; ' + s + '</div>';
      });
      h += '</div>';
    }

    // ── Collision events table ────────────────────────────────────────────
    h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px;">';
    h += '<div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;letter-spacing:0.05em;">COLLISION EVENTS — THIS SHIFT</div>';
    if (events.length === 0) {
      h += '<div style="font-size:12px;color:var(--text-secondary);">No collision events recorded this shift.</div>';
    } else {
      h += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
      h += '<tr style="color:var(--text-secondary);border-bottom:1px solid var(--border);">';
      h += '<th style="text-align:left;padding:4px 8px;">TYPE</th><th style="text-align:left;padding:4px 8px;">ZONE</th><th style="text-align:left;padding:4px 8px;">LM</th><th style="text-align:left;padding:4px 8px;">CARRIER</th><th style="text-align:left;padding:4px 8px;">TIME (UTC)</th></tr>';
      events.slice().reverse().forEach(ev => {
        const tc = ev.type === 'CD' ? 'var(--red)' : 'var(--yellow)';
        h += '<tr style="border-bottom:1px solid rgba(48,54,61,0.5);">';
        h += '<td style="padding:4px 8px;font-weight:700;color:'+tc+';">'+ev.type+'</td>';
        h += '<td style="padding:4px 8px;">Zone '+ev.zone+'</td>';
        h += '<td style="padding:4px 8px;">'+(ev.lm ? 'LM'+ev.lm : '&#8212;')+'</td>';
        h += '<td style="padding:4px 8px;">CA-'+String(ev.carrier||0).padStart(4,'0')+'</td>';
        h += '<td style="padding:4px 8px;color:var(--text-secondary);">'+(ev.time||'').slice(0,16)+'</td>';
        h += '</tr>';
      });
      h += '</table>';
    }
    h += '</div>';

    // ── Recent Slack posts log ─────────────────────────────────────────────
    h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;">';
    h += '<div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;letter-spacing:0.05em;">RECENT ALARMS POSTED TO SLACK</div>';
    if (alarms.length === 0) {
      h += '<div style="font-size:12px;color:var(--text-secondary);">No alarms posted yet this session.</div>';
    } else {
      alarms.slice().reverse().forEach(a => {
        const bc = a.type === 'SORTER_STOP' ? 'var(--red)' : a.type === 'CD' ? 'var(--red)' : 'var(--yellow)';
        h += '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(48,54,61,0.4);">';
        h += '<span style="font-size:18px;flex-shrink:0;">' + (a.type === 'SORTER_STOP' ? '&#9940;' : '&#9889;') + '</span>';
        h += '<div><div style="font-size:12px;font-weight:600;color:'+bc+';">'+a.title+'</div>';
        h += '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">'+a.message+'</div>';
        h += '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">'+a.time+'</div></div>';
        h += '</div>';
      });
    }
    h += '</div>';

    container.innerHTML = h;
  }

  return { init, refresh, showShiftReport, showSorterTab, showMetricsTab, showChuteJamsTab, showInboundTab, showOutboundSouth, showOutboundNorth, showFrontOfBuilding, showShoeSorter, showIah3LizardTab };
})();
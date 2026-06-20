/**
 * RDU2 Enhancements — runs after detail.js renders the page.
 * Adds sub-tabs and fixes KPI layout for RDU2 only.
 */
(function() {
  // Only run on RDU2
  const params = new URLSearchParams(window.location.search);
  if (params.get('id') !== 'RDU2') return;

  // Wait for detail.js to finish rendering
  const observer = new MutationObserver(function(mutations, obs) {
    const header = document.querySelector('.detail-header');
    const kpiRow = document.querySelector('.kpi-row');
    if (header && kpiRow) {
      obs.disconnect();
      enhance();
    }
  });
  observer.observe(document.getElementById('detail-content'), { childList: true, subtree: true });

  function enhance() {
    addSubTabs();
    fixKPIs();
    addStyle();
  }

  function addSubTabs() {
    const header = document.querySelector('.detail-header');
    if (!header) return;

    const bar = document.createElement('div');
    bar.className = 'rdu2-subtab-bar';
    bar.innerHTML = `
      <button class="rdu2-stab active" onclick="window.rdu2Tab(-1)">Overview</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(0)">CP Zones</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(1)">Metrics</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(2)">Shift Reports</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(3)">IXD Wiki</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(4)">Outbound</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(5)">Inbound</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(6)">Sorter</button>
      <button class="rdu2-stab" onclick="window.rdu2Tab(7)">Induction</button>
    `;
    header.after(bar);

    // Wrap existing content in overview div
    const content = document.getElementById('detail-content');
    const children = Array.from(content.children);
    const overview = document.createElement('div');
    overview.id = 'rdu2-overview';
    children.forEach(function(child) {
      if (child !== document.querySelector('.detail-header') && child !== bar) {
        overview.appendChild(child);
      }
    });
    content.appendChild(overview);

    // Add sub-tab panes
    const panes = document.createElement('div');
    panes.id = 'rdu2-panes';
    panes.style.display = 'none';
    panes.innerHTML = `
      <div id="rst-0" class="rst-pane"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> CP Panel Zone Assignment</div><table class="data-table"><thead><tr><th>Panel</th><th>Zone</th></tr></thead><tbody><tr><td>CP01</td><td>Receiving Inbound</td></tr><tr><td>CP02</td><td>Receiving North</td></tr><tr><td>CP31</td><td>SIPS – ATAC</td></tr><tr><td>CP33-34</td><td>TTCB Jackpot S/N</td></tr><tr><td>CP41-42</td><td>UIS 20lb/5lb</td></tr><tr><td>CP51-53</td><td>Each to Sort</td></tr><tr><td>CP60-63</td><td>RPND West/East</td></tr><tr><td>CP67</td><td>IntelliMerge + Sort</td></tr><tr><td>CP71-79</td><td>Fluid Load SE/SW/NE/NW</td></tr><tr><td>CP82-85</td><td>TTCB Loop Sorter</td></tr><tr><td>CP90-94</td><td>Pallet Build + Robotic</td></tr></tbody></table></div></div>
      <div id="rst-1" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Weekly Metrics (Wk25)</div><table class="data-table"><thead><tr><th>Metric</th><th>Value</th><th>Target</th></tr></thead><tbody><tr><td>Scan Defect</td><td>3.43%</td><td>&lt;3.0%</td></tr><tr><td>MHE Defect</td><td>0.31%</td><td>&lt;1.5%</td></tr><tr><td>FPY</td><td>99.7%</td><td>&gt;95%</td></tr><tr><td>Failed Diverts</td><td>25,691</td><td>—</td></tr><tr><td>Total Inducted</td><td>845,427</td><td>—</td></tr><tr><td>Total Diverted</td><td>1,176,018</td><td>—</td></tr></tbody></table></div></div>
      <div id="rst-2" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Shift Report Schedule</div><table class="data-table"><thead><tr><th>Report</th><th>Schedule</th><th>Channel</th></tr></thead><tbody><tr><td>Shift Summary</td><td>7am / 7pm</td><td>metrics</td></tr><tr><td>Sorter Health</td><td>9am daily</td><td>RDU2 production</td></tr><tr><td>Carrier Report</td><td>5am / 5pm</td><td>carrier_faults</td></tr><tr><td>Hourly Scanner</td><td>Every hour</td><td>metrics</td></tr></tbody></table></div></div>
      <div id="rst-3" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--yellow)"></span> IXD Wiki</div><p><a href="https://w.amazon.com/bin/view/IXD-SD/SITES/RDU2" target="_blank" style="color:var(--blue)">Open RDU2 Wiki ↗</a></p><iframe src="https://w.amazon.com/bin/view/IXD-SD/SITES/RDU2" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:8px;margin-top:8px;"></iframe></div></div>
      <div id="rst-4" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Outbound Zones</div><table class="data-table"><thead><tr><th>Zone</th><th>Panel</th><th>Description</th></tr></thead><tbody><tr><td>RPND West</td><td>CP60</td><td>Robotic palletize west</td></tr><tr><td>RPND East</td><td>CP62-63</td><td>East center + inbound</td></tr><tr><td>Fluid Load</td><td>CP71-79</td><td>SE/SW/NE/NW lanes</td></tr><tr><td>Pallet Build</td><td>CP90-94</td><td>Palletizer S/N</td></tr></tbody></table></div></div>
      <div id="rst-5" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Inbound Zones</div><table class="data-table"><thead><tr><th>Zone</th><th>Panel</th><th>Description</th></tr></thead><tbody><tr><td>Receiving</td><td>CP01-02</td><td>Main + North</td></tr><tr><td>SIPS/ATAC</td><td>CP31</td><td>SIPS – ATAC lines</td></tr><tr><td>UIS</td><td>CP41-42</td><td>20lb + 5lb</td></tr><tr><td>Each to Sort</td><td>CP51-53</td><td>Sort zones</td></tr></tbody></table></div></div>
      <div id="rst-6" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> TTCB Sorter</div><table class="data-table"><thead><tr><th>Spec</th><th>Value</th></tr></thead><tbody><tr><td>Chutes</td><td>144 active</td></tr><tr><td>Discharge CRBs</td><td>4 units</td></tr><tr><td>WPT Health Check</td><td>16 positions</td></tr><tr><td>Belt Tension</td><td>130N new / 110N used</td></tr><tr><td>MCB Board</td><td>432D757.CB</td></tr></tbody></table></div></div>
      <div id="rst-7" class="rst-pane" style="display:none"><div class="section-panel"><div class="section-title"><span class="section-dot" style="background:var(--green)"></span> Induction System</div><table class="data-table"><thead><tr><th>Station</th><th>PLC</th><th>Inductions</th></tr></thead><tbody><tr><td>1-4</td><td>CP67</td><td>Parcel 1-4</td></tr><tr><td>5-8</td><td>CP02</td><td>Parcel 5-8</td></tr><tr><td>10-13</td><td>CP67</td><td>Parcel 10-13</td></tr><tr><td>15-18</td><td>CP01</td><td>Parcel 15-18</td></tr></tbody></table></div></div>
    `;
    content.appendChild(panes);
  }

  function fixKPIs() {
    const kpiRow = document.querySelector('.kpi-row');
    if (!kpiRow) return;
    // Change to 4-column grid
    kpiRow.style.display = 'grid';
    kpiRow.style.gridTemplateColumns = 'repeat(4, 1fr)';
    kpiRow.style.gap = '8px';
  }

  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .rdu2-subtab-bar { display:flex; gap:6px; flex-wrap:wrap; padding:10px 0; border-bottom:1px solid var(--border,#30363d); margin-bottom:14px; }
      .rdu2-stab { padding:5px 14px; border:1px solid var(--border,#30363d); border-radius:6px; cursor:pointer; background:var(--card,#161b22); color:var(--text-secondary,#7d8590); font-size:12px; transition:all .15s; }
      .rdu2-stab.active { background:var(--blue,#58a6ff); border-color:var(--blue,#58a6ff); color:#0d1117; font-weight:600; }
      .rdu2-stab:hover:not(.active) { border-color:var(--blue,#58a6ff); color:var(--blue,#58a6ff); }
      .rst-pane { display:block; }
    `;
    document.head.appendChild(style);
  }

  // Global tab switcher
  window.rdu2Tab = function(n) {
    var overview = document.getElementById('rdu2-overview');
    var panes = document.getElementById('rdu2-panes');
    if (n === -1) {
      if (overview) overview.style.display = 'block';
      if (panes) panes.style.display = 'none';
    } else {
      if (overview) overview.style.display = 'none';
      if (panes) panes.style.display = 'block';
      for (var i = 0; i <= 7; i++) {
        var el = document.getElementById('rst-' + i);
        if (el) el.style.display = (i === n) ? 'block' : 'none';
      }
    }
    document.querySelectorAll('.rdu2-stab').forEach(function(btn, idx) {
      btn.classList.toggle('active', (n === -1 && idx === 0) || (n >= 0 && idx === n + 1));
    });
    window.scrollTo(0, 0);
  };
})();

/**
 * IXD Systems Dashboard — Shift History Page Logic
 * ════════════════════════════════════════════════════
 * Loads and displays event CSV data for a selected site and date range.
 * Provides sortable/filterable table and category summary.
 */

const ShiftHistory = (() => {
  let _events = [];
  let _sortCol = 'timestamp';
  let _sortAsc = false;
  let _filterCategory = 'all';

  async function init() {
    try {
      await DataLayer.loadSites();
    } catch (e) {
      showError('Unable to load site configuration.');
      return;
    }
    renderControls();
  }

  function renderControls() {
    const sites = DataLayer.getSites();
    const siteSelect = document.getElementById('history-site-select');
    if (siteSelect) {
      siteSelect.innerHTML = '<option value="">Select site...</option>' +
        sites.map(s => `<option value="${s.id}">${s.id} (${s.oem})</option>`).join('');
    }

    // Set default dates (last 7 days)
    const endInput = document.getElementById('history-date-end');
    const startInput = document.getElementById('history-date-start');
    if (endInput && startInput) {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      endInput.value = today;
      startInput.value = weekAgo;
    }

    const loadBtn = document.getElementById('history-load-btn');
    if (loadBtn) {
      loadBtn.addEventListener('click', loadEvents);
    }
  }

  async function loadEvents() {
    const siteId = document.getElementById('history-site-select')?.value;
    const startDate = document.getElementById('history-date-start')?.value;
    const endDate = document.getElementById('history-date-end')?.value;

    if (!siteId) {
      showError('Please select a site.');
      return;
    }
    if (!startDate || !endDate) {
      showError('Please select a date range.');
      return;
    }

    const container = document.getElementById('history-results');
    if (container) container.innerHTML = '<div class="loading">Loading event data...</div>';

    // Generate list of expected CSV filenames
    const files = generateCsvFileList(siteId, startDate, endDate);
    _events = [];
    const errors = [];

    // Fetch all CSVs
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const url = `${CONFIG.DATA_BASE_URL}/${siteId}/events/${file}`;
        try {
          const resp = await fetch(url);
          if (resp.status === 404) return null; // file doesn't exist for this shift
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return await resp.text();
        } catch (e) {
          errors.push(file);
          return null;
        }
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value) {
        const parsed = parseCSV(r.value);
        _events.push(...parsed);
      }
    });

    if (errors.length > 0) {
      showWarning(`Failed to load ${errors.length} file(s): ${errors.join(', ')}`);
    }

    renderResults();
  }

  function generateCsvFileList(siteId, startDate, endDate) {
    // Generate date_shift combinations between start and end
    const files = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0].replace(/-/g, '');
      files.push(`${dateStr}_day.csv`);
      files.push(`${dateStr}_night.csv`);
      current.setDate(current.getDate() + 1);
    }
    return files;
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const events = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = splitCSVLine(lines[i]);
      if (vals.length < headers.length) continue;
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = vals[idx]?.trim() || ''; });
      events.push(obj);
    }
    return events;
  }

  function splitCSVLine(line) {
    // Simple CSV split (handles quoted fields)
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }

  function renderResults() {
    const container = document.getElementById('history-results');
    if (!container) return;

    if (_events.length === 0) {
      container.innerHTML = '<div class="loading">No events found for the selected range.</div>';
      return;
    }

    let html = '';

    // Category summary
    const categories = {};
    _events.forEach(e => {
      const cat = e.category || e.error_type || 'other';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    html += '<div class="section-panel">';
    html += '<div class="section-title"><span class="section-dot" style="background:var(--blue)"></span> Event Summary by Category</div>';
    html += '<div class="kpi-row">';
    Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      html += `<div class="kpi-card blue">
        <div class="kpi-label">${esc(cat)}</div>
        <div class="kpi-value blue">${count}</div>
        <div class="kpi-subtitle">events</div></div>`;
    });
    html += '</div></div>';

    // Filter bar for categories
    html += '<div class="filter-bar" id="category-filter">';
    html += '<button class="filter-btn active" data-cat="all">All</button>';
    Object.keys(categories).sort().forEach(cat => {
      html += `<button class="filter-btn" data-cat="${esc(cat)}">${esc(cat)}</button>`;
    });
    html += '</div>';

    // Events table
    html += '<div class="events-table-wrap">';
    html += '<table class="data-table" id="events-table">';
    html += '<thead><tr>';
    html += '<th data-col="timestamp" class="sortable">Timestamp ▼</th>';
    html += '<th data-col="tag" class="sortable">Tag</th>';
    html += '<th data-col="display" class="sortable">Display</th>';
    html += '<th data-col="category" class="sortable">Category</th>';
    html += '<th data-col="duration_secs" class="sortable">Duration</th>';
    html += '<th data-col="active" class="sortable">Active</th>';
    html += '</tr></thead><tbody>';
    html += renderEventRows();
    html += '</tbody></table></div>';

    container.innerHTML = html;

    // Attach sort handlers
    container.querySelectorAll('.sortable').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (_sortCol === col) _sortAsc = !_sortAsc;
        else { _sortCol = col; _sortAsc = true; }
        document.querySelector('#events-table tbody').innerHTML = renderEventRows();
      });
    });

    // Category filter handlers
    const catFilter = document.getElementById('category-filter');
    if (catFilter) {
      catFilter.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        _filterCategory = btn.dataset.cat;
        catFilter.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('#events-table tbody').innerHTML = renderEventRows();
      });
    }
  }

  function renderEventRows() {
    let filtered = _events;
    if (_filterCategory !== 'all') {
      filtered = _events.filter(e => (e.category || e.error_type || 'other') === _filterCategory);
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[_sortCol] || '';
      const bVal = b[_sortCol] || '';
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return _sortAsc ? cmp : -cmp;
    });

    // Limit to 500 rows for performance
    const display = filtered.slice(0, 500);

    return display.map(e => `<tr>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(e.timestamp || '')}</td>
      <td>${esc(e.tag || e.device || '')}</td>
      <td>${esc(e.display || '')}</td>
      <td>${esc(e.category || e.error_type || '')}</td>
      <td style="font-family:var(--font-mono)">${esc(e.duration_secs || e.duration || '')}</td>
      <td>${esc(e.active || '')}</td>
    </tr>`).join('');
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showError(msg) {
    const container = document.getElementById('history-results');
    if (container) container.innerHTML = `<div class="error-banner">⚠ ${msg}</div>`;
  }

  function showWarning(msg) {
    const banner = document.getElementById('warning-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.textContent = msg;
    }
  }

  return { init };
})();

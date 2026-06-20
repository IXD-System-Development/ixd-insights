# IXD Systems Dashboard — POC Deployment Checklist

## Target: 3–6 Live Sites by End of Next Week

### Phase 1: GitHub Repo Setup (30 min)

- [ ] Create repo: `robsms/ixd-systems-dashboard`
- [ ] Push dashboard files (index.html, site.html, history.html, css/, js/, data/)
- [ ] Enable GitHub Pages (Settings → Pages → Deploy from main branch)
- [ ] Create Fine-Grained PAT with **Contents: Read/Write** on this repo
- [ ] Verify Pages URL loads: `https://robsms.github.io/ixd-systems-dashboard/`

### Phase 2: Switch DATA_BASE_URL for Production (5 min)

In `js/config.js`, swap:
```javascript
// DATA_BASE_URL: 'data',  // local dev
DATA_BASE_URL: 'https://raw.githubusercontent.com/robsms/ixd-systems-dashboard/main/data',
```

### Phase 3: Deploy INTL Sites (per site ~15 min)

Target sites: **MEM1** (CR), **IAH3** (WPT), **RDU2** (WPT)

For each INTL site:

1. Remote into site PC
2. Copy `fleet_push.py` to `1 - System/` folder
3. Add to `2 - Settings/.leviathan_secrets`:
   ```
   FLEET_PUSH_TOKEN=ghp_xxxxxxxxxxxxx
   ```
4. Add to `2 - Settings/site_config.json`:
   ```json
   "fleet_push": {
     "enabled": true,
     "repo": "robsms/ixd-systems-dashboard",
     "branch": "main",
     "interval_seconds": 33
   }
   ```
5. Add to `leviathan_intl.py` after dashboard starts (~line 1650):
   ```python
   from fleet_push import start_fleet_push
   start_fleet_push(cfg())
   ```
6. Restart Leviathan service
7. Verify: check `data/{site}.json` appears in GitHub repo within 60s

### Phase 4: Deploy DEM Sites (per site ~15 min)

Target sites: **SWF2**, **BJC1**

For each DEM site:

1. Remote into site PC
2. Copy `fleet_push.py` AND `fleet_push_dem.py` to `1 - System/`
3. Add token + config (same as INTL above)
4. Add to `leviathan_dem.py` after engines start:
   ```python
   from fleet_push_dem import start_fleet_push_dem
   start_fleet_push_dem(cfg())
   ```
5. Restart Leviathan service
6. Verify: check `data/{site}.json` in repo

### Phase 5: Validate Dashboard (10 min)

- [ ] Load `https://robsms.github.io/ixd-systems-dashboard/`
- [ ] Verify live sites show green "LIVE" staleness indicator
- [ ] Click into an INTL site — confirm full health sections render
- [ ] Click into a DEM site — confirm simplified view with notice
- [ ] Let it sit for 2 minutes — confirm auto-refresh updates timestamps
- [ ] Test region filter

## Build Type Coverage

| Build Type | Sites | What it proves |
|-----------|-------|----------------|
| INTL CR (Conductor Rail) | MEM1, LAX9 | Full PLC health with brush-style drives |
| INTL WPT (Wireless Power) | IAH3, RDU2 | Full PLC health with wireless PPU/WPT |
| DEM | SWF2, BJC1 | Limited telemetry (Safety PLC + Trace) |

## Rollback

If a site push is causing issues:
1. Set `"fleet_push": { "enabled": false }` in site_config.json
2. Restart Leviathan — push stops immediately
3. Old health JSON stays in the repo (dashboard shows stale indicator)

## Known Limitations (POC)

- Single-commit pushes (no batching) — fine for 6 sites, watch at 22
- No authentication on the dashboard URL itself (public repo = public dashboard)
- Event CSV push not yet wired (shift history page won't have data until added)
- Staleness will show "STALE" for sites not yet deployed (expected)

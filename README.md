# IXD Systems Dashboard

Central multi-site dashboard for all 22 IXD crossbelt sorter deployments.  
Hosted on GitHub Pages — fed by Leviathan site engines pushing live data.

**Status**: POC Ready — dashboard built, push modules ready for deployment.

## Live at

```
https://robsms.github.io/ixd-systems-dashboard/
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  IXD SYSTEMS DASHBOARD                        │
│            (GitHub Pages — static HTML/JS)                    │
│                                                              │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         ┌──────┐    │
│   │ RDU2 │ │ MEM1 │ │ TEB9 │ │ VGT2 │  . . .  │ SWF2 │    │
│   └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘         └──┬───┘    │
└──────┼────────┼────────┼────────┼─────────────────┼─────────┘
       │        │        │        │                 │
   data/rdu2  data/mem1  data/teb9  ...           data/swf2
       .json    .json    .json                     .json
       │        │        │        │                 │
┌──────┴────────┴────────┴────────┴─────────────────┴─────────┐
│                    GITHUB REPO                                │
│          robsms/ixd-systems-dashboard                        │
└──────────────────────────────────────────────────────────────┘
       ▲        ▲        ▲        ▲                 ▲
       │        │        │        │                 │
┌──────┴──┐ ┌──┴───┐ ┌──┴───┐ ┌──┴───┐       ┌───┴──┐
│Leviathan│ │Levthn│ │Levthn│ │Levthn│       │Levthn│
│  RDU2   │ │ MEM1 │ │ TEB9 │ │ VGT2 │       │ SWF2 │
│(site PC)│ │(site)│ │(site)│ │(site)│       │(site)│
└────┬────┘ └──┬───┘ └──┬───┘ └──┬───┘       └──┬───┘
     │         │        │        │               │
   [PLC]     [PLC]    [PLC]    [PLC]           [PLC]
```

## Pages

| Page | File | Purpose |
|------|------|---------|
| Overview | `index.html` | All 22 sites as status cards, region filters |
| Site Detail | `site.html?id=RDU2` | Full health deep-dive (INTL) or simplified (DEM) |
| Shift History | `history.html` | Event CSV analysis, trends, category breakdown |

## Features

- Dark industrial theme (matches Leviathan local UI)
- Auto-refresh: 60s overview, 30s detail
- Staleness detection: LIVE / X min ago / STALE
- Region filtering with shareable URL
- INTL sites: KPIs, PPU, WPT, LSM, Scanners, Comms, Live State
- DEM sites: Safety PLC + Trace (simplified view with notice)
- Graceful error handling: individual site failures don't break the grid
- Rate limit detection with automatic pause
- Tab visibility pause (conserves API budget when tab hidden)
- No build step — static files served directly

## File Structure

```
13 - IXD Systems Dashboard/
├── index.html              ← Overview grid
├── site.html               ← Site detail page
├── history.html            ← Shift history viewer
├── css/
│   └── dashboard.css       ← Dark industrial theme
├── js/
│   ├── config.js           ← URL config, intervals, thresholds
│   ├── data.js             ← Fetch layer, staleness, status logic
│   ├── overview.js         ← Grid rendering, filters, refresh
│   ├── detail.js           ← INTL/DEM detail rendering
│   └── history.js          ← CSV loading, table, charts
├── data/
│   ├── sites.json          ← Site registry (22 sites)
│   ├── {SITE}.json         ← Live health per site (pushed by engines)
│   └── {SITE}/events/      ← CSV shift exports
├── push_module/
│   ├── fleet_push.py       ← INTL push module (drops into site PC)
│   ├── fleet_push_dem.py   ← DEM push module
│   └── README.md           ← Deployment instructions
├── DEPLOYMENT.md           ← POC deployment checklist
├── DESIGN.md               ← Architecture decisions
└── README.md               ← This file
```

## POC Targets (End of Next Week)

| # | Site | OEM | Build | Proves |
|---|------|-----|-------|--------|
| 1 | MEM1 | INTL | CR | Conductor Rail full health |
| 2 | IAH3 | INTL | WPT | Wireless Power full health |
| 3 | RDU2 | INTL | WPT | Second WPT site |
| 4 | SWF2 | DEM | — | Dematic Safety+Trace |
| 5 | BJC1 | DEM | — | Second DEM site |
| 6 | LAX9 | INTL | CR | Second CR site |

## Data Contract

### Live Health (`data/{site}.json`)

Pushed every 33 seconds by site engine. INTL schema:
```json
{
  "connection_status": "online",
  "timestamp": "ISO",
  "site": "RDU2",
  "oem": "INTL",
  "_pushed_at": "ISO",
  "sorter": { "running": true, "speed": 2540 },
  "carriers": { "faulted": 12, "disabled": 45, "available": 2283, "availability_pct": 97.6 },
  "scanners": [{ "label": "IND1-Scn1", "nr_pct": 1.2 }],
  "ppu": [{ "index": 1, "state": "RUNNING" }],
  "wpt": [{ "index": 0, "error": false, "carrier": null }],
  "crb": { "master_alarm": false, "units": [] },
  "comms": { "awcs_ok": true, "icw_ok": true },
  "lsm_zones": [{ "zone": 1, "collision_detect": false, "vfd_fault": false }],
  "priority_actions": [{ "text": "...", "severity": "WARNING" }]
}
```

DEM schema (simplified):
```json
{
  "connection_status": "online",
  "site": "SWF2",
  "oem": "DEM",
  "_pushed_at": "ISO",
  "safety_plc": { "status": "OK", "estops_active": 0 },
  "trace": { "connected": true, "active_faults": 0 }
}
```

## Local Development

```bash
cd "13 - IXD Systems Dashboard"
python -m http.server 8090
# Open http://localhost:8090
```

Sample data in `data/` directory provides realistic rendering for development.

## Deployment

See `DEPLOYMENT.md` for the full step-by-step checklist.

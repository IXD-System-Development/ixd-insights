# IXD Insights — Changelog

## v5.3.0 (2026-06-20) — Full Integration

### Dashboard Overhaul
- Replaced static HTML with dynamic IXD Insights dashboard
- Merged Leviathan monitoring engine with GitHub Pages delivery
- Added real-time PLC data push from RDU2 site PC (every 60 seconds)

### Main Navigation
- **Network** — Fleet-wide weekly KPI comparison (Wk24 vs Wk25)
- **rIXD NA** — 36-site fleet overview with clickable site cards
- Site cards show: Carrier Availability, Faulted count, Speed

### RDU2 Site Page (accessible via rIXD NA card click)
- **Overview** — Live KPIs, DTW banner, PPU/WPT/CRB/LSM health grids
- **CP Zones** — All 32 CP panel zone assignments
- **Metrics** — Weekly accumulative KPIs with Wk24→Wk25 trends
- **Shift Reports** — Report schedule, manual fire commands
- **IXD Wiki** — Embedded Amazon wiki (iframe)
- **Outbound** — TTCB chutes, MDR takeaway zones
- **Inbound** — Receiving zones, conveyor health
- **Sorter** — Shoe sorter (TTCB divert), failure taxonomy
- **Induction** — 18 stations, CTB/CRB health, components

### Live Data (updates every 60 seconds)
- Sorter running state + speed
- Faulted carriers (from PLC OEE tags)
- Disabled carriers
- Carrier availability %
- Max recirc %
- Scan defect % (cumulative NR)
- Header timestamp
- DTW/Break window detection (blinking banner)

### Leviathan Engine (v5.3.0) — Running on RDU2 site PC
- Fixed alarm spam: PLC discovery priming (first read = baseline, no alerts)
- Cleared debounce: 10s hold before posting CLEARED to Slack
- Recurring jam detection: 5+ events in 1 hour triggers pattern alert
- Blackout windows: suppress alerts during shift transitions
- PLC-first architecture: scanners, chutes, ERDO all from PLC (ICW only for carrier investigation)
- Enhanced shift reports: WPT/CTB/PPU health, FTD root-cause breakdown
- Fleet CSV export to GitHub at shift boundaries

### Data Architecture
- Site PCs push `data/SITE.json` to this repo every 60 seconds
- Dashboard reads JSON files and renders dynamically
- Schema: connection_status, sorter state, carriers, scanners, PPU, WPT, CRB, LSM, comms, strays

### Scheduled Tasks (RDU2 site PC)
| Task | Schedule | Script |
|------|----------|--------|
| Dashboard push | Every 1 min | `run_once.py` → pushes to GitHub |
| Leviathan monitor | Always running | `leviathan_intl.py` (alarms + ERDO + reports) |
| PLC-to-Slack | Always running | `main.py` (883 tags, 36 PLCs) |
| Daily health report | 9:00 AM | `rdu2_sorter_health_full.py` |
| Weekly reset | Sunday midnight | `weekly_reset.py` (snapshot counters) |

### Sites Pending Connection
- IAH3 (Houston TX) — setup docs ready
- VGT2 (Las Vegas NV) — setup docs ready
- 34 other sites — disconnected, awaiting site PC deployment

---
*Deployed by robsms via Leviathan fleet management system*

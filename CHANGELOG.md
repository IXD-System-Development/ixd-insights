# IXD Insights — Changelog

## v5.4.0 (2026-06-20) — Full Integration

### Dashboard Overhaul
- Replaced static HTML with dynamic IXD Insights dashboard
- Merged Leviathan monitoring engine with GitHub Pages delivery
- Added real-time PLC data push from RDU2 site PC (every 33 seconds)

### Main Navigation
- **Network** — Fleet-wide weekly KPI comparison (Wk24 vs Wk25)
- **Sites** — 22-site IXD fleet overview with clickable site cards
- Site cards show: Carrier Availability, Faulted count, Speed (INTL) or Safety/Trace (DEM)

### RDU2 Site Page (accessible via Sites card click)
- **Overview** — Live KPIs, DTW banner, PPU/WPT/CRB/LSM health grids
- **CP Zones** — All 32 CP panel zone assignments
- **Metrics** — Weekly accumulative KPIs with Wk24→Wk25 trends
- **Shift Reports** — Report schedule, manual fire commands
- **Wiki** — Site knowledge base
- **Outbound** — TTCB chutes, MDR takeaway zones
- **Inbound** — Receiving zones, conveyor health
- **Sorter** — TTCB crossbelt divert, failure taxonomy
- **Induction** — 18 stations, CTB/CRB health, components

### Live Data (updates every 33 seconds)
- Sorter running state + speed
- Faulted carriers (from PLC OEE tags)
- Disabled carriers
- Carrier availability %
- Max recirc %
- Scan defect % (cumulative NR)
- Header timestamp
- DTW/Break window detection (blinking banner)

### Leviathan Engine (v5.4.0) — Running on RDU2 site PC
- Fixed alarm spam: ICW carrier alarms (Motor Not Running, Communication Fault, Cart Regulator, WPT Cart Status) suppressed from Slack — only belt-stopping events post
- Belt-stopping whitelist: Emergency Stop, Gates, Clockpulse Fault, LSM Drive Main Switch, Synchronization Fault, Disconnect, Drive Fault, I/O Connection Fault, JOG Station Safety Relay, Scanner Not Alive, Collision Guard, Fire Alarm
- Cascade batch suppression: 6-second window groups downstream faults into structured report
- Cleared debounce: suppressed ICW types don't post CLEARED either
- PLC-first architecture: scanners, chutes, ERDO all from PLC (ICW only for carrier investigation reports)
- Enhanced shift reports: WPT/CTB/PPU health, FTD root-cause breakdown
- Fleet CSV export to GitHub at shift boundaries

### Data Architecture
- Site PCs push `data/SITE.json` to this repo every 33 seconds via GitHub Contents API
- Dashboard reads JSON files client-side and renders dynamically
- INTL schema: connection_status, sorter, carriers, scanners, PPU, WPT, CRB, LSM, comms, strays, lifetime, priority_actions
- DEM schema: connection_status, safety_plc, trace (limited telemetry)

### Site OEM Registry (22 IXD crossbelt sites)
| OEM | Sites |
|-----|-------|
| INTL (Intelligrated CB4000) | GYR3, IAH3, LAS1, LAX9, MEM1, ORF2, RDU2, VGT2 |
| DEM (Dematic) | BJC1, FWA4, GYR2, IND9, MCC1, MQJ1, PSP3, RFD2, RMN3, SBD1, SCK4, SWF2, TEB9, TOL3 |

### Scheduled Tasks (RDU2 site PC)
| Task | Schedule | Script |
|------|----------|--------|
| Fleet health push | Every 33s | `fleet_push.py` → pushes to GitHub |
| Leviathan monitor | Always running | `leviathan_intl.py` (alarms + ERDO + reports) |
| Daily health report | 9:00 AM | `rdu2_sorter_health_full.py` |
| Weekly reset | Sunday midnight | `weekly_reset.py` (snapshot counters) |

### Sites Live
- RDU2 (Smithfield NC) — INTL WPT — connected

### Sites Pending Connection
- MEM1 (Memphis TN) — INTL CR — next deployment
- IAH3 (Houston TX) — INTL WPT — next deployment
- SWF2 (Newburgh NY) — DEM — next deployment
- BJC1 (Denver CO) — DEM — next deployment
- LAX9 (Los Angeles CA) — INTL CR — next deployment
- 16 remaining sites — awaiting site PC deployment

---
*Deployed by robsms via Leviathan fleet management system*

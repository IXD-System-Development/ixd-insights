# IXD Systems Dashboard — Design Notes

## Mission

Give regional managers a single URL to view the health of all 22 IXD 
crossbelt sorter sites in real time. Give site CSx teams a local engine 
(Leviathan) that handles Slack alerts + data collection while also 
feeding the global view.

## Two Layers

### Layer 1: Leviathan (Local Site Engine)
- Runs on a dedicated PC at each site
- Reads PLC via EtherNet/IP (pycomm3)
- Posts to Slack (perfected alarm messages)
- Serves local dashboard at localhost:8080 (full site health)
- Pushes data to GitHub every 12s (live) + at shift breaks (CSV)
- **Does NOT change** — the app is locked. We only add the push module.

### Layer 2: IXD Systems Dashboard (GitHub Pages)
- Static site at robsms.github.io/ixd-systems-dashboard
- Reads JSON from `data/{site}.json` 
- No backend, no server, no database
- Anyone with the URL can view (public repo) or restricted (private + Pages)

## Push Cadence

| Stream | Frequency | Size | Purpose |
|--------|-----------|------|---------|
| Live health | 12 seconds | ~8KB | Real-time sorter status |
| Event CSV | 2x/day (shift breaks) | 50-200KB | Historical analysis |

### Rate Limit Strategy

GitHub Contents API: 5000 req/hr (authenticated).  
At 12s intervals: 300 pushes/hr/site.  
22 sites × 300 = 6600/hr — **over limit**.

**Solution**: Use Git Data API (blobs + trees + commits) which counts as fewer 
API calls, OR stagger sites across a 12s window (site 1 at :00, site 2 at :00.5, etc.),
OR push to separate branches and merge via Action.

**Recommended**: Push every 30s (120/hr/site × 22 = 2640/hr) and accept 
30s staleness on the global view. Local dashboard still polls PLC every 3s.

## Page Structure

```
index.html          — Multi-site overview grid (all 22 sites)
site.html?id=rdu2   — Per-site deep dive (reuses site_health_html style)
history.html        — Shift history viewer (loads CSVs, charts)
```

## Open Questions

1. Public or private repo? (Private + Pages needs GitHub Pro/Team)
2. 12s vs 30s push cadence (rate limit vs freshness tradeoff)
3. Do DEM sites get the same depth as INTL, or a simplified view until upgraded?
4. Regional grouping — by geography or by manager?
5. Authentication — open URL or basic login gate?

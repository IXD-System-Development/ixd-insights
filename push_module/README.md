# Fleet Push Module

Drops into any Leviathan site engine to push health JSON to the IXD Systems Dashboard GitHub repo.

## Quick Start

### 1. Add Token to Site Secrets

On the site PC, edit `2 - Settings/.leviathan_secrets`:

```
FLEET_PUSH_TOKEN=ghp_your_fine_grained_pat_here
```

Token needs **Contents: Read and Write** permission on `robsms/ixd-systems-dashboard`.

### 2. Add Config to `site_config.json`

```json
{
  "fleet_push": {
    "enabled": true,
    "repo": "robsms/ixd-systems-dashboard",
    "branch": "main",
    "interval_seconds": 33
  }
}
```

### 3. Integration (INTL Sites)

In `leviathan_intl.py`, after the dashboard thread starts:

```python
from fleet_push import start_fleet_push
start_fleet_push(cfg())
```

The module fetches from `http://localhost:8080/api/plc-health` and pushes to
`data/{site}.json` in the repo.

### 4. Integration (DEM Sites)

Same pattern — drop `fleet_push.py` and `fleet_push_dem.py` into `1 - System/`:

```python
from fleet_push_dem import start_fleet_push_dem
start_fleet_push_dem(cfg())
```

DEM module reads from the PLC directly (Safety PLC status) and from the trace
parser state, then assembles a simplified health JSON.

### 5. Standalone Testing

```bash
python fleet_push.py --site RDU2 --oem INTL --interval 33 --secrets path/to/.leviathan_secrets
```

## Push Flow

```
Site PC                          GitHub Repo
┌────────────┐                  ┌────────────────────────┐
│ Leviathan  │ ─── HTTP GET ──→ │ localhost:8080          │
│ FleetPush  │ ←── JSON ──────  │ /api/plc-health        │
│            │                   └────────────────────────┘
│            │ ─── PUT ────────→ api.github.com/repos/.../
│            │ ←── 200 ─────── │ contents/data/RDU2.json │
└────────────┘                  └────────────────────────┘
```

## Rate Limit Considerations

- GitHub Contents API: 5000 requests/hr (authenticated PAT)
- At 33s intervals: ~109 pushes/hr per site
- 22 sites × 109 = ~2400/hr — well within limits
- The module handles SHA tracking (required for file updates)
- 409 conflicts auto-recover on next push cycle

## Deployment Priority (POC Targets)

| Priority | Site | OEM | Build Type | Notes |
|----------|------|-----|-----------|-------|
| 1 | MEM1 | INTL | CR (Conductor Rail) | Full PLC health |
| 2 | IAH3 | INTL | WPT (Wireless Power) | Full PLC health |
| 3 | RDU2 | INTL | WPT | Full PLC health |
| 4 | SWF2 | DEM | — | Safety PLC + Trace |
| 5 | BJC1 | DEM | — | Safety PLC + Trace |
| 6 | LAX9 | INTL | CR | Full PLC health |

## Files

- `fleet_push.py` — Main push module (INTL + universal)
- `fleet_push_dem.py` — DEM-specific health assembler
- `README.md` — This file

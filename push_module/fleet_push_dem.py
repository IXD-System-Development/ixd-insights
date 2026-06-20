# -*- coding: utf-8 -*-
"""
Leviathan Fleet Push — DEM (Dematic) Variant
═══════════════════════════════════════════════════════════════════════════
DEM sites don't have the full /api/plc-health endpoint like INTL.
Instead, this module reads directly from:
  1. Safety PLC via pycomm3 (E-stop, gate, zone status)
  2. Local SQLite DB (trace parser active fault counts)

Produces a simplified health JSON matching the DEM schema expected
by the IXD Systems Dashboard.

INTEGRATION:
  In leviathan_dem.py:
    from fleet_push_dem import start_fleet_push_dem
    start_fleet_push_dem(cfg())

@author: robsms
@version: 1.0.0
"""
from __future__ import annotations

import base64
import json
import sqlite3
import ssl
import sys
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


# ═══════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════

_DEFAULT_REPO = "ixd-system-development/ixd-insights"
_DEFAULT_BRANCH = "main"
_DEFAULT_INTERVAL = 33

_config: Dict[str, Any] = {}
_token: str = ""
_site: str = ""
_running = False
_thread: Optional[threading.Thread] = None
_last_sha: str = ""


# ═══════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════

def start_fleet_push_dem(site_config: dict, secrets_path: Optional[Path] = None) -> bool:
    """Start DEM fleet push background thread.

    Parameters
    ----------
    site_config : dict
        Full site_config.json. Expects:
          site_config["site"] — site code
          site_config["oem"] — "DEM"
          site_config["plc"]["path"] — Safety PLC IP path
          site_config["trace"]["carrier_count"] — fleet size
          site_config["fleet_push"]["enabled"] — bool
    """
    global _config, _token, _site, _running, _thread

    fp = site_config.get("fleet_push", {})
    if not fp.get("enabled", False):
        print("[FleetPush-DEM] Disabled in config — skipping")
        return False

    _site = site_config.get("site", "")
    if not _site:
        print("[FleetPush-DEM] ERROR: No 'site' in config")
        return False

    _config = {
        "repo": fp.get("repo", _DEFAULT_REPO),
        "branch": fp.get("branch", _DEFAULT_BRANCH),
        "interval": fp.get("interval_seconds", _DEFAULT_INTERVAL),
        "plc_path": site_config.get("plc", {}).get("path", ""),
        "carrier_count": site_config.get("trace", {}).get("carrier_count", 1845),
        "db_path": _resolve_db_path(),
    }

    _token = _load_token(secrets_path)
    if not _token:
        print("[FleetPush-DEM] ERROR: No FLEET_PUSH_TOKEN — cannot push")
        return False

    _running = True
    _thread = threading.Thread(target=_push_loop, daemon=True, name="FleetPush-DEM")
    _thread.start()
    print(f"[FleetPush-DEM] Started — {_site} → {_config['repo']} "
          f"every {_config['interval']}s")
    return True


def stop_fleet_push_dem():
    """Stop the fleet push thread."""
    global _running
    _running = False


# ═══════════════════════════════════════════════════════════════
# INTERNAL
# ═══════════════════════════════════════════════════════════════

def _resolve_db_path() -> str:
    """Resolve path to leviathan.db."""
    base = Path(__file__).resolve().parent
    candidates = [
        base.parent / "3 - Data" / "leviathan.db",
    ]
    if getattr(sys, 'frozen', False):
        exe_root = Path(sys.executable).resolve().parent.parent
        candidates.insert(0, exe_root / "3 - Data" / "leviathan.db")
    for p in candidates:
        if p.exists():
            return str(p)
    return str(candidates[0])


def _load_token(secrets_path: Optional[Path] = None) -> str:
    """Load FLEET_PUSH_TOKEN from .leviathan_secrets."""
    base = Path(__file__).resolve().parent
    candidates = [
        base.parent / "2 - Settings" / ".leviathan_secrets",
        base / ".leviathan_secrets",
    ]
    if secrets_path:
        candidates = [secrets_path]
    if getattr(sys, 'frozen', False):
        exe_root = Path(sys.executable).resolve().parent.parent
        candidates.insert(0, exe_root / "2 - Settings" / ".leviathan_secrets")

    for path in candidates:
        if path and path.exists():
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line.startswith("FLEET_PUSH_TOKEN="):
                        return line.split("=", 1)[1].strip()
            except Exception:
                continue
    return ""


def _push_loop():
    """Main push loop for DEM sites."""
    time.sleep(10)  # Let engines initialize

    while _running:
        try:
            health = _assemble_dem_health()
            health["_pushed_at"] = datetime.now(timezone.utc).isoformat()
            health["_push_source"] = "leviathan_fleet_push_dem"

            success = _push_to_github(health)
            if success:
                _log(f"Pushed {_site}.json ({len(json.dumps(health))} bytes)")
        except Exception as e:
            _log(f"Error: {e}", level="ERROR")

        time.sleep(_config["interval"])


def _assemble_dem_health() -> Dict[str, Any]:
    """Build DEM health JSON from Safety PLC and local DB.

    Schema matches what the dashboard expects for DEM sites:
    {
      connection_status, timestamp, site, oem, supported,
      carrier_count, safety_plc: { status, estops_active, gates_open, zones_bypassed },
      trace: { connected, last_update, active_faults, chute_jams, carrier_sd_trips }
    }
    """
    now = datetime.now(timezone.utc).isoformat()

    health: Dict[str, Any] = {
        "connection_status": "offline",
        "timestamp": now,
        "site": _site,
        "oem": "DEM",
        "supported": True,
        "carrier_count": _config["carrier_count"],
        "safety_plc": {
            "status": "UNKNOWN",
            "estops_active": 0,
            "gates_open": 0,
            "zones_bypassed": 0,
        },
        "trace": {
            "connected": False,
            "last_update": None,
            "active_faults": 0,
            "chute_jams": 0,
            "carrier_sd_trips": 0,
        },
    }

    # --- Read Safety PLC ---
    plc_path = _config.get("plc_path", "")
    if plc_path:
        try:
            safety_data = _read_safety_plc(plc_path)
            health["safety_plc"] = safety_data
            health["connection_status"] = "online"
        except Exception as e:
            _log(f"Safety PLC read failed: {e}", level="WARN")

    # --- Read trace state from DB ---
    db_path = _config.get("db_path", "")
    if db_path and Path(db_path).exists():
        try:
            trace_data = _read_trace_from_db(db_path)
            health["trace"] = trace_data
            if health["connection_status"] != "online" and trace_data["connected"]:
                health["connection_status"] = "online"
        except Exception as e:
            _log(f"Trace DB read failed: {e}", level="WARN")

    return health


def _read_safety_plc(plc_path: str) -> Dict[str, Any]:
    """Read Safety PLC status tags.

    Standard DEM safety tags:
      - Safety_Status.OK (BOOL)
      - Estop_Count (DINT or derived from individual tags)
      - Gate_Open_Count (DINT or derived)
      - Zone_Bypass_Count (DINT or derived)
    """
    try:
        from pycomm3 import LogixDriver
    except ImportError:
        return {"status": "UNKNOWN", "estops_active": 0,
                "gates_open": 0, "zones_bypassed": 0}

    # Read safety overview tags
    tags = [
        "Safety_OK",
        "Estop_Active_Count",
        "Gate_Open_Count",
        "Zone_Bypass_Count",
    ]

    try:
        with LogixDriver(plc_path, timeout=10) as plc:
            results = plc.read(*tags)
            if not isinstance(results, list):
                results = [results]

        vals = {}
        for r in results:
            if hasattr(r, 'tag') and r.error is None:
                vals[r.tag] = r.value

        safety_ok = bool(vals.get("Safety_OK", False))
        estops = int(vals.get("Estop_Active_Count", 0) or 0)
        gates = int(vals.get("Gate_Open_Count", 0) or 0)
        bypassed = int(vals.get("Zone_Bypass_Count", 0) or 0)

        status = "OK" if safety_ok and estops == 0 else "FAULT"
        return {
            "status": status,
            "estops_active": estops,
            "gates_open": gates,
            "zones_bypassed": bypassed,
        }
    except Exception as e:
        raise RuntimeError(f"Safety PLC read: {e}")


def _read_trace_from_db(db_path: str) -> Dict[str, Any]:
    """Read active fault counts from Leviathan SQLite DB.

    Queries the events table for currently active (not cleared) faults.
    """
    conn = sqlite3.connect(db_path, timeout=5)

    # Check if trace parser has posted a heartbeat recently
    connected = False
    last_update = None
    try:
        row = conn.execute(
            "SELECT ts FROM heartbeats WHERE name = 'trace_parser'"
        ).fetchone()
        if row:
            last_update = row[0]
            from datetime import datetime as dt
            hb_time = dt.fromisoformat(row[0].replace('Z', '+00:00'))
            age = (datetime.now(timezone.utc) - hb_time).total_seconds()
            connected = age < 120
    except Exception:
        pass

    # Active faults (events where active=1)
    active_faults = 0
    chute_jams = 0
    carrier_sd = 0
    try:
        active_faults = conn.execute(
            "SELECT COUNT(*) FROM events WHERE active = 1"
        ).fetchone()[0]
        chute_jams = conn.execute(
            "SELECT COUNT(*) FROM events WHERE active = 1 AND "
            "(category LIKE '%jam%' OR tag LIKE '%chute_jam%')"
        ).fetchone()[0]
        carrier_sd = conn.execute(
            "SELECT COUNT(*) FROM events WHERE active = 1 AND "
            "(category LIKE '%carrier%' OR tag LIKE '%carrier_sd%')"
        ).fetchone()[0]
    except Exception:
        pass

    conn.close()

    return {
        "connected": connected,
        "last_update": last_update,
        "active_faults": active_faults,
        "chute_jams": chute_jams,
        "carrier_sd_trips": carrier_sd,
    }


def _push_to_github(data: Dict[str, Any]) -> bool:
    """Push health JSON to GitHub (same logic as INTL module)."""
    global _last_sha

    repo = _config["repo"]
    branch = _config["branch"]
    file_path = f"data/{_site}.json"
    api_url = f"https://api.github.com/repos/{repo}/contents/{file_path}"

    content_bytes = json.dumps(data, indent=None, separators=(',', ':')).encode("utf-8")
    content_b64 = base64.b64encode(content_bytes).decode("ascii")

    payload: Dict[str, Any] = {
        "message": f"{_site} health push",
        "content": content_b64,
        "branch": branch,
    }
    if _last_sha:
        payload["sha"] = _last_sha

    try:
        payload_bytes = json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": f"Leviathan-FleetPush-DEM/{_site}",
            "Content-Type": "application/json",
        }
        ctx = ssl.create_default_context()
        req = urllib.request.Request(api_url, data=payload_bytes,
                                     headers=headers, method="PUT")
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            if 200 <= resp.status < 300:
                resp_data = json.loads(resp.read().decode("utf-8"))
                _last_sha = resp_data.get("content", {}).get("sha", "")
                return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        if e.code in (409, 422):
            _last_sha = _get_file_sha(api_url)
            _log(f"SHA conflict — refreshed, retry next cycle")
        else:
            _log(f"GitHub push failed ({e.code}): {body[:100]}", level="ERROR")
    except Exception as e:
        _log(f"GitHub push error: {e}", level="ERROR")
    return False


def _get_file_sha(api_url: str) -> str:
    """Fetch current file SHA from GitHub."""
    try:
        headers = {
            "Authorization": f"Bearer {_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": f"Leviathan-FleetPush-DEM/{_site}",
        }
        ctx = ssl.create_default_context()
        req = urllib.request.Request(api_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("sha", "")
    except Exception:
        return ""


def _log(msg: str, level: str = "INFO"):
    """Print log message."""
    print(f"[FleetPush-DEM/{_site}] [{level}] {msg}")

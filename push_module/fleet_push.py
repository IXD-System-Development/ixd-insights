# -*- coding: utf-8 -*-
"""
Leviathan Fleet Push Module — Push Health JSON to IXD Systems Dashboard
═══════════════════════════════════════════════════════════════════════════
Runs as a background thread inside the Leviathan engine. Polls the local
/api/plc-health endpoint every 33 seconds and pushes the JSON response to
the ixd-systems-dashboard GitHub repo via the Contents API.

INTEGRATION:
  Drop this file into the Leviathan site's "1 - System/" folder.
  Add to site_config.json:
    "fleet_push": {
      "enabled": true,
      "repo": "robsms/ixd-systems-dashboard",
      "branch": "main",
      "interval_seconds": 33
    }

  Token comes from .leviathan_secrets:
    FLEET_PUSH_TOKEN=ghp_xxxxxxxxxxxxx

  Then in leviathan_intl.py (or leviathan_dem.py), after dashboard starts:
    from fleet_push import start_fleet_push
    start_fleet_push(site_config)

@author: robsms
@version: 1.0.0
"""
from __future__ import annotations

import base64
import json
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
_DEFAULT_INTERVAL = 33  # seconds
_LOCAL_HEALTH_URL = "http://localhost:8080/api/plc-health"

# Resolved at startup
_config: Dict[str, Any] = {}
_token: str = ""
_site: str = ""
_oem: str = ""
_running = False
_thread: Optional[threading.Thread] = None
_last_sha: str = ""  # Track file SHA for updates (required by Contents API)


# ═══════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════

def start_fleet_push(site_config: dict, secrets_path: Optional[Path] = None) -> bool:
    """Start the fleet push background thread.

    Parameters
    ----------
    site_config : dict
        Full site_config.json content. Expects:
          site_config["site"] — site code (e.g. "RDU2")
          site_config["oem"] — "INTL" or "DEM"
          site_config["fleet_push"]["enabled"] — bool
          site_config["fleet_push"]["repo"] — GitHub repo
          site_config["fleet_push"]["branch"] — target branch
          site_config["fleet_push"]["interval_seconds"] — push cadence
    secrets_path : Path, optional
        Path to .leviathan_secrets file. Defaults to standard location.

    Returns
    -------
    bool
        True if thread started, False if disabled or missing config.
    """
    global _config, _token, _site, _oem, _running, _thread

    fp = site_config.get("fleet_push", {})
    if not fp.get("enabled", False):
        print("[FleetPush] Disabled in config — skipping")
        return False

    _site = site_config.get("site", "")
    _oem = site_config.get("oem", "")
    if not _site:
        print("[FleetPush] ERROR: No 'site' in config")
        return False

    _config = {
        "repo": fp.get("repo", _DEFAULT_REPO),
        "branch": fp.get("branch", _DEFAULT_BRANCH),
        "interval": fp.get("interval_seconds", _DEFAULT_INTERVAL),
    }

    # Load token
    _token = _load_token(secrets_path)
    if not _token:
        print("[FleetPush] ERROR: No FLEET_PUSH_TOKEN in secrets — cannot push")
        return False

    # Start background thread
    _running = True
    _thread = threading.Thread(target=_push_loop, daemon=True, name="FleetPush")
    _thread.start()
    print(f"[FleetPush] Started — {_site} → {_config['repo']} "
          f"every {_config['interval']}s")
    return True


def stop_fleet_push():
    """Stop the fleet push thread."""
    global _running
    _running = False
    print("[FleetPush] Stopped")


# ═══════════════════════════════════════════════════════════════
# INTERNAL
# ═══════════════════════════════════════════════════════════════

def _load_token(secrets_path: Optional[Path] = None) -> str:
    """Load FLEET_PUSH_TOKEN from .leviathan_secrets."""
    if secrets_path is None:
        # Standard location: SITE_ROOT / "2 - Settings" / ".leviathan_secrets"
        base = Path(__file__).resolve().parent
        # Try relative to script location (1 - System/)
        candidates = [
            base.parent / "2 - Settings" / ".leviathan_secrets",
            base / ".leviathan_secrets",
        ]
        if getattr(sys, 'frozen', False):
            exe_root = Path(sys.executable).resolve().parent.parent
            candidates.insert(0, exe_root / "2 - Settings" / ".leviathan_secrets")
    else:
        candidates = [secrets_path]

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
    """Main push loop — runs in background thread."""
    global _last_sha
    # Initial delay to let dashboard API start
    time.sleep(10)

    while _running:
        try:
            # 1. Fetch health from local dashboard API
            health = _fetch_local_health()
            if health is None:
                time.sleep(_config["interval"])
                continue

            # 2. Inject push metadata
            health["_pushed_at"] = datetime.now(timezone.utc).isoformat()
            health["_push_source"] = "leviathan_fleet_push"
            health["oem"] = _oem

            # 3. Push to GitHub
            success = _push_to_github(health)
            if success:
                _log(f"Pushed {_site}.json ({len(json.dumps(health))} bytes)")
            else:
                _log("Push failed — will retry next cycle", level="WARN")

        except Exception as e:
            _log(f"Error in push loop: {e}", level="ERROR")

        time.sleep(_config["interval"])


def _fetch_local_health() -> Optional[Dict[str, Any]]:
    """Fetch /api/plc-health from the local Leviathan dashboard."""
    try:
        req = urllib.request.Request(_LOCAL_HEALTH_URL)
        # Dashboard may require auth — add a service token if configured
        # For local access, most deployments allow unauthenticated reads
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # Try with auth header if 401
        if e.code == 401:
            return _fetch_local_health_with_auth()
        _log(f"Local health fetch failed: HTTP {e.code}", level="WARN")
    except Exception as e:
        _log(f"Local health fetch failed: {e}", level="WARN")
    return None


def _fetch_local_health_with_auth() -> Optional[Dict[str, Any]]:
    """Fetch with service account auth (for sites with auth enabled)."""
    try:
        # Login first
        login_payload = json.dumps({
            "username": "fleet_push",
            "password": "fleet_push"
        }).encode("utf-8")
        login_req = urllib.request.Request(
            "http://localhost:8080/api/auth/login",
            data=login_payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(login_req, timeout=10) as resp:
            token = json.loads(resp.read().decode("utf-8")).get("token", "")

        if not token:
            return None

        # Now fetch health with token
        health_req = urllib.request.Request(
            _LOCAL_HEALTH_URL,
            headers={"Authorization": f"Bearer {token}"}
        )
        with urllib.request.urlopen(health_req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _push_to_github(data: Dict[str, Any]) -> bool:
    """Push health JSON to GitHub via Contents API.

    Uses PUT /repos/{owner}/{repo}/contents/data/{site}.json
    Requires the SHA of the existing file for updates (not creates).
    """
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

    # Include SHA for file updates (skip on first push / new file)
    if _last_sha:
        payload["sha"] = _last_sha

    try:
        payload_bytes = json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": f"Leviathan-FleetPush/{_site}",
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
        if e.code == 409:
            # SHA conflict — fetch current SHA and retry
            _last_sha = _get_file_sha(api_url)
            _log(f"SHA conflict — refreshed SHA, will retry next cycle")
        elif e.code == 422 and "sha" in body.lower():
            # File exists but we didn't send SHA — fetch it
            _last_sha = _get_file_sha(api_url)
            _log(f"File exists — fetched SHA, will retry next cycle")
        elif e.code == 403:
            _log(f"Rate limited or forbidden ({e.code})", level="WARN")
        else:
            _log(f"GitHub push failed ({e.code}): {body[:100]}", level="ERROR")
    except Exception as e:
        _log(f"GitHub push error: {e}", level="ERROR")

    return False


def _get_file_sha(api_url: str) -> str:
    """Fetch the current SHA of a file from GitHub."""
    try:
        headers = {
            "Authorization": f"Bearer {_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": f"Leviathan-FleetPush/{_site}",
        }
        ctx = ssl.create_default_context()
        req = urllib.request.Request(api_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("sha", "")
    except Exception:
        return ""


def _log(msg: str, level: str = "INFO"):
    """Print log message with FleetPush prefix."""
    print(f"[FleetPush/{_site}] [{level}] {msg}")


# ═══════════════════════════════════════════════════════════════
# STANDALONE MODE — Run directly for testing
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Leviathan Fleet Push Module")
    parser.add_argument("--site", required=True, help="Site code (e.g. RDU2)")
    parser.add_argument("--oem", default="INTL", help="OEM type (INTL or DEM)")
    parser.add_argument("--repo", default=_DEFAULT_REPO, help="GitHub repo")
    parser.add_argument("--interval", type=int, default=33, help="Push interval seconds")
    parser.add_argument("--secrets", default=None, help="Path to .leviathan_secrets")
    parser.add_argument("--health-url", default=_LOCAL_HEALTH_URL,
                        help="Local health endpoint URL")
    args = parser.parse_args()

    _LOCAL_HEALTH_URL = args.health_url

    config = {
        "site": args.site,
        "oem": args.oem,
        "fleet_push": {
            "enabled": True,
            "repo": args.repo,
            "interval_seconds": args.interval,
        }
    }

    secrets_path = Path(args.secrets) if args.secrets else None
    started = start_fleet_push(config, secrets_path)
    if started:
        print(f"Fleet push running for {args.site}. Press Ctrl+C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            stop_fleet_push()
    else:
        print("Failed to start fleet push. Check config and token.")
        sys.exit(1)

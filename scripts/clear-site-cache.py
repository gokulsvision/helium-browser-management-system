#!/usr/bin/env python3
"""Clear listed site service-worker caches. Never touches logins."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HOME = Path.home()
APP = HOME / "Library/Application Support/Browser Management System"
LOG = HOME / "Library/Logs/browser-management-system.log"
HELIUM_SW = (
    HOME
    / "Library/Application Support/net.imput.helium/Default/Service Worker/CacheStorage"
)


def ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(f"{ts()} {msg}\n")


def policy_path() -> Path:
    user = APP / "POLICY.md"
    if user.exists():
        return user
    return Path(__file__).resolve().parent.parent / "POLICY.md"


def parse_cache_hosts(text: str) -> list[str]:
    hosts = []
    in_disk = False
    for raw in text.splitlines():
        line = raw.strip()
        if line.lower() == "## disk cache":
            in_disk = True
            continue
        if line.startswith("## ") and in_disk:
            in_disk = False
        if in_disk and line.startswith("### "):
            host = line[4:].strip().lower()
            host = re.sub(r"^www\.", "", host)
            if host:
                hosts.append(host)
    return hosts


def helium_running() -> bool:
    try:
        subprocess.check_output(["pgrep", "-x", "Helium"])
        return True
    except subprocess.CalledProcessError:
        return False


def cache_mentions(dir_path: Path, host: str) -> bool:
    idx = dir_path / "index.txt"
    blob = idx.read_bytes() if idx.exists() else b""
    text = blob.decode("utf-16le", "ignore") + blob.decode("latin1", "ignore")
    return host.lower() in text.lower()


def main() -> int:
    APP.mkdir(parents=True, exist_ok=True)
    policy = policy_path()
    if not policy.exists():
        log(f"no policy file at {policy}")
        return 1
    hosts = parse_cache_hosts(policy.read_text())
    if not hosts:
        log("no disk-cache hosts in policy")
        return 0
    if helium_running():
        log("skip: Helium is running")
        return 0
    if not HELIUM_SW.is_dir():
        log("no CacheStorage")
        return 0
    freed = 0
    for d in list(HELIUM_SW.iterdir()):
        if not d.is_dir():
            continue
        if not any(cache_mentions(d, h) for h in hosts):
            continue
        sz = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        shutil.rmtree(d, ignore_errors=True)
        freed += sz
        log(f"removed {d.name} for {hosts} ({sz} bytes)")
    log(f"done freed_bytes={freed} policy={policy}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

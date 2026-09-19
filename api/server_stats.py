"""Read-only server health for the admin dashboard: host, storage, services, fail2ban, API usage.

Everything here is best effort and Linux-flavoured: on a developer's Windows machine (or a box
without fail2ban) each section reports ``available: False`` instead of failing. Nothing here
changes state; the only privileged calls are ``fail2ban-client status`` and ``ufw status`` via
``sudo -n``, which return immediately if sudo is not allowed.
"""

from __future__ import annotations

import os
import re
import shutil
import socket
import subprocess
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ID_SEGMENT = re.compile(r"/(evt|race|run)-[0-9a-f]{6,}|/[0-9a-f]{16}(?=/|$)|/OTRI-DEMO-\d+|/\d+(?=/|$)")


def _run(command: list[str], timeout: float = 5.0) -> str | None:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return completed.stdout if completed.returncode == 0 else None


# ------------------------------------------------------------------------------ host


def _read_cpu_ticks() -> tuple[int, int] | None:
    try:
        with open("/proc/stat", encoding="utf-8") as handle:
            first = handle.readline().split()
    except OSError:
        return None
    values = [int(v) for v in first[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return sum(values), idle


def host_stats(sample_seconds: float = 0.25) -> dict:
    out: dict = {"available": False, "hostname": socket.gethostname(), "cpu_count": os.cpu_count()}
    try:
        load1, load5, load15 = os.getloadavg()
        out.update({"load_1": round(load1, 2), "load_5": round(load5, 2), "load_15": round(load15, 2)})
    except (OSError, AttributeError):
        pass
    before = _read_cpu_ticks()
    if before:
        time.sleep(sample_seconds)
        after = _read_cpu_ticks()
        if after and after[0] > before[0]:
            total = after[0] - before[0]
            idle = after[1] - before[1]
            out["cpu_percent"] = round(100.0 * (total - idle) / total, 1)
    try:
        info = {}
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                key, _, rest = line.partition(":")
                info[key] = int(rest.split()[0]) * 1024
        out["memory_total"] = info.get("MemTotal")
        out["memory_available"] = info.get("MemAvailable")
        out["swap_total"] = info.get("SwapTotal")
        out["swap_free"] = info.get("SwapFree")
    except (OSError, ValueError, IndexError):
        pass
    try:
        with open("/proc/uptime", encoding="utf-8") as handle:
            out["uptime_seconds"] = int(float(handle.read().split()[0]))
    except (OSError, ValueError, IndexError):
        pass
    out["available"] = "cpu_percent" in out or "memory_total" in out
    return out


def _dir_size(path: Path) -> int | None:
    if not path or not path.exists():
        return None
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def storage_stats(paths: dict[str, Path | None], database_size: int | None) -> dict:
    root = Path(paths.get("root") or "/")
    out: dict = {"available": True, "database_bytes": database_size, "dirs": {}}
    try:
        usage = shutil.disk_usage(root)
        out.update({"disk_total": usage.total, "disk_used": usage.used, "disk_free": usage.free})
    except OSError:
        out["available"] = False
    for label, path in paths.items():
        if label == "root":
            continue
        out["dirs"][label] = {"path": str(path) if path else None, "bytes": _dir_size(path) if path else None}
    return out


# ------------------------------------------------------------------------------ services


def services_status(units: tuple[str, ...] = ("otri-api", "nginx", "postgresql", "fail2ban", "unattended-upgrades")) -> dict:
    if shutil.which("systemctl") is None:
        return {"available": False, "units": {}}
    out = {}
    for unit in units:
        state = _run(["systemctl", "is-active", unit], timeout=3)
        out[unit] = (state or "unknown").strip() if state is not None else "inactive"
    return {"available": True, "units": out}


def firewall_status() -> dict:
    if shutil.which("ufw") is None and shutil.which("sudo") is None:
        return {"available": False}
    text = _run(["sudo", "-n", "ufw", "status"], timeout=4)
    if text is None:
        return {"available": False}
    lines = [line for line in text.splitlines() if line.strip()]
    active = any(line.lower().startswith("status: active") for line in lines)
    rules = [line for line in lines[3:] if line and not line.startswith("--")] if active else []
    return {"available": True, "active": active, "rules": rules[:12]}


# ------------------------------------------------------------------------------ fail2ban


def parse_fail2ban_jail(text: str) -> dict:
    """Parse ``fail2ban-client status <jail>`` output into numbers and the banned list."""
    out: dict = {"currently_failed": 0, "total_failed": 0, "currently_banned": 0, "total_banned": 0, "banned_ips": []}
    for line in text.splitlines():
        label, _, value = line.partition(":")
        label = label.strip(" |`-	").lower()
        value = value.strip()
        if label == "currently failed":
            out["currently_failed"] = int(value or 0)
        elif label == "total failed":
            out["total_failed"] = int(value or 0)
        elif label == "currently banned":
            out["currently_banned"] = int(value or 0)
        elif label == "total banned":
            out["total_banned"] = int(value or 0)
        elif label == "banned ip list":
            out["banned_ips"] = value.split() if value else []
    return out


def fail2ban_status() -> dict:
    if shutil.which("fail2ban-client") is None:
        return {"available": False, "reason": "fail2ban-client not installed"}
    summary = _run(["sudo", "-n", "fail2ban-client", "status"], timeout=5) or _run(["fail2ban-client", "status"], timeout=5)
    if summary is None:
        return {"available": False, "reason": "no permission to query fail2ban"}
    jails = []
    for line in summary.splitlines():
        if "jail list" in line.lower():
            _, _, value = line.partition(":")
            jails = [j.strip() for j in value.replace(",", " ").split() if j.strip()]
    out = {"available": True, "jails": []}
    for jail in jails:
        detail = _run(["sudo", "-n", "fail2ban-client", "status", jail], timeout=5) or _run(["fail2ban-client", "status", jail], timeout=5)
        parsed = parse_fail2ban_jail(detail or "")
        parsed["name"] = jail
        out["jails"].append(parsed)
    return out


# ------------------------------------------------------------------------------ API usage (journal)

_ACCESS_LINE = re.compile(
    r'^(?P<ts>\S+)\s+\S+\s+\S+:\s+(?P<ip>\S+?)(?::\d+)?\s+-\s+"(?P<method>[A-Z]+)\s+(?P<path>\S+)\s+HTTP/[\d.]+"\s+(?P<status>\d{3})'
)


def normalize_path(path: str) -> str:
    """Collapse ids so /races/race-1a2b3c4d/results and /races/race-9f8e7d6c/results count together."""
    path = path.split("?", 1)[0]
    return _ID_SEGMENT.sub(lambda m: "/" + ("{id}" if not m.group(0).startswith("/OTRI") else "{id}"), path)


def parse_access_log(text: str, now: datetime, hours: int = 24) -> dict:
    """Aggregate journal lines (``journalctl -o short-iso``) from gunicorn's access log."""
    since = now - timedelta(hours=hours)
    total = 0
    by_status = Counter()
    by_path = Counter()
    by_ip = Counter()
    per_hour = [0] * hours
    errors_5xx = 0
    slowest = None  # gunicorn's default log has no timing; kept for a future format
    for line in text.splitlines():
        match = _ACCESS_LINE.match(line)
        if not match:
            continue
        try:
            stamp = datetime.fromisoformat(match.group("ts"))
        except ValueError:
            continue
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        if stamp < since:
            continue
        total += 1
        status = match.group("status")
        by_status[status[0] + "xx"] += 1
        if status.startswith("5"):
            errors_5xx += 1
        by_path[f"{match.group('method')} {normalize_path(match.group('path'))}"] += 1
        by_ip[match.group("ip")] += 1
        bucket = int((stamp - since).total_seconds() // 3600)
        if 0 <= bucket < hours:
            per_hour[bucket] += 1
    return {
        "available": True,
        "hours": hours,
        "since": since.isoformat(),
        "total": total,
        "by_status": dict(by_status),
        "errors_5xx": errors_5xx,
        "per_hour": per_hour,
        "top_paths": [{"path": p, "count": c} for p, c in by_path.most_common(12)],
        "top_ips": [{"ip": ip, "count": c} for ip, c in by_ip.most_common(8)],
        "unique_ips": len(by_ip),
        "slowest": slowest,
    }


def api_usage(unit: str = "otri-api", hours: int = 24) -> dict:
    if shutil.which("journalctl") is None:
        return {"available": False, "reason": "no systemd journal on this host"}
    text = _run(["journalctl", "-u", unit, f"--since=-{hours}h", "-o", "short-iso", "--no-pager", "-q"], timeout=15)
    if text is None:
        return {"available": False, "reason": "journal not readable"}
    return parse_access_log(text, datetime.now(timezone.utc), hours)


def tls_expiry(host: str | None) -> dict:
    """Days until the TLS certificate of `host` expires, checked by connecting to it."""
    if not host or host in ("localhost", "127.0.0.1") or ":" in host:
        return {"available": False}
    try:
        import ipaddress
        import ssl

        # The host is the request's Host header, which the caller writes. Only a name that resolves
        # to public addresses is connected to, and the connection goes to the address that was
        # checked: otherwise this is a way to ask the server which machines of its private network
        # (or the cloud's metadata address) answer on port 443.
        addresses = {info[4][0] for info in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
        if not addresses or not all(ipaddress.ip_address(address.split("%")[0]).is_global for address in addresses):
            return {"available": False}
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2  # never negotiate TLS 1.0/1.1, even on an old OpenSSL
        with socket.create_connection((sorted(addresses)[0], 443), timeout=4) as sock:
            with context.wrap_socket(sock, server_hostname=host) as tls:
                cert = tls.getpeercert()
        not_after = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        return {"available": True, "host": host, "not_after": not_after.isoformat(), "days_left": (not_after - datetime.now(timezone.utc)).days}
    except Exception:  # noqa: BLE001 - any failure just means "unknown"
        return {"available": False, "host": host}

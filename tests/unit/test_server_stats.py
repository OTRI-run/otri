"""Parsers behind the admin Server tab (pure functions; the live probes are exercised via the API test)."""

from datetime import datetime, timedelta, timezone

from api.server_stats import normalize_path, parse_access_log, parse_fail2ban_jail


def test_fail2ban_jail_output_is_parsed():
    text = """Status for the jail: sshd
|- Filter
|  |- Currently failed:\t3
|  |- Total failed:\t412
|  `- File list:\t/var/log/auth.log
`- Actions
   |- Currently banned:\t2
   |- Total banned:\t57
   `- Banned IP list:\t203.0.113.7 198.51.100.9
"""
    parsed = parse_fail2ban_jail(text)
    assert parsed == {"currently_failed": 3, "total_failed": 412, "currently_banned": 2, "total_banned": 57, "banned_ips": ["203.0.113.7", "198.51.100.9"]}


def test_access_log_lines_are_aggregated_per_hour_status_path_and_ip():
    now = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)
    def line(hours_ago, ip, method, path, status):
        stamp = (now - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%S+0000")
        return f'{stamp} Otri-Singapore gunicorn[123]: {ip}:0 - "{method} {path} HTTP/1.0" {status}'
    text = "\n".join([
        line(0.5, "203.0.113.7", "GET", "/races", 200),
        line(0.5, "203.0.113.7", "GET", "/races/race-1a2b3c4d/results", 200),
        line(2, "198.51.100.9", "GET", "/races/race-9f8e7d6c/results", 200),
        line(2, "198.51.100.9", "POST", "/gpx/analyze", 500),
        line(30, "198.51.100.9", "GET", "/races", 200),  # outside the window
        "2026-09-18T11:00:00+0000 Otri-Singapore gunicorn[123]: Booting worker with pid: 5",
    ])
    usage = parse_access_log(text, now, hours=24)
    assert usage["total"] == 4 and usage["unique_ips"] == 2 and usage["errors_5xx"] == 1
    assert usage["by_status"] == {"2xx": 3, "5xx": 1}
    assert usage["top_paths"][0] == {"path": "GET /races/{id}/results", "count": 2}
    assert sum(usage["per_hour"]) == 4 and usage["per_hour"][23] == 2 and usage["per_hour"][22] == 2
    assert usage["top_ips"][0]["ip"] in ("203.0.113.7", "198.51.100.9"), "port stripped from the client address"
    assert normalize_path("/runners/run-ab12cd34") == "/runners/{id}"
    assert normalize_path("/gpx/shared/f6f37d88e5448b17") == "/gpx/shared/{id}"
    assert normalize_path("/admin/organizers/7/verify") == "/admin/organizers/{id}/verify"
    assert normalize_path("/races/OTRI-DEMO-001?x=1") == "/races/{id}"


def test_a_backup_that_stopped_coming_is_said_so(tmp_path):
    """The nightly dump once failed for want of an executable bit and nothing anywhere said so."""
    import os
    from datetime import datetime, timedelta, timezone

    from api.server_stats import backup_status

    assert backup_status(tmp_path)["ok"] is False and backup_status(tmp_path)["newest"] is None
    now = datetime(2026, 9, 20, 8, 0, tzinfo=timezone.utc)
    for name, hours_ago, size in (("otri-old.sql.gz", 60, 5000), ("otri-new.sql.gz", 6, 5000)):
        (tmp_path / name).write_bytes(b"x" * size)
        stamp = (now - timedelta(hours=hours_ago)).timestamp()
        os.utime(tmp_path / name, (stamp, stamp))
    fresh = backup_status(tmp_path, now)
    assert fresh["ok"] is True and fresh["count"] == 2 and fresh["age_hours"] == 6.0 and fresh["bytes"] == 5000
    assert backup_status(tmp_path, now + timedelta(hours=30))["ok"] is False, "a night was missed"
    (tmp_path / "otri-new.sql.gz").write_bytes(b"")
    os.utime(tmp_path / "otri-new.sql.gz", (now.timestamp(), now.timestamp()))
    assert backup_status(tmp_path, now)["ok"] is False, "an empty dump is no backup"


def test_the_watchdog_is_reported_and_absent_where_there_is_no_systemd(monkeypatch):
    from api import server_stats

    monkeypatch.setattr(server_stats.shutil, "which", lambda name: None)
    assert server_stats.watchdog_status() == {"available": False}
    monkeypatch.setattr(server_stats.shutil, "which", lambda name: "/usr/bin/" + name)
    answers = {"is-active": "active\n", "--property=LastTriggerUSec": "Sat 2026-09-19 14:50:01 UTC\n", "--property=Result": "success\n"}
    monkeypatch.setattr(server_stats, "_run", lambda command, timeout=5.0: next(text for key, text in answers.items() if key in command))
    assert server_stats.watchdog_status() == {"available": True, "active": True, "last_check": "Sat 2026-09-19 14:50:01 UTC", "last_result": "success"}

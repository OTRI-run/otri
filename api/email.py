"""Transactional email via Resend (https://resend.com) — verification + password reset.

Gated behind ``RESEND_API_KEY``, same pattern as ``OTRI_API_JWT_SECRET``: if
unset, emails are logged instead of sent (safe for local dev), with a loud
warning so it's never silently broken in a real deployment.
"""

from __future__ import annotations

import os

import resend

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
EMAIL_FROM = os.environ.get("OTRI_EMAIL_FROM", "OTRI <noreply@otri.run>")
APP_BASE_URL = os.environ.get("OTRI_APP_BASE_URL", "http://localhost:5173")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    print(
        "WARNING: RESEND_API_KEY is not set - verification/password-reset emails "
        "will be printed to the console instead of sent. Set RESEND_API_KEY for a "
        "real deployment."
    )


def _send(to: str, subject: str, html: str) -> None:
    if not RESEND_API_KEY:
        print(f"[email not sent - no RESEND_API_KEY] to={to!r} subject={subject!r}\n{html}")
        return
    try:
        resend.Emails.send({"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html})
    except resend.exceptions.ResendError as error:
        # Never let an email-provider hiccup break registration/login/reset —
        # log loudly and continue. A failed verification/reset email is
        # recoverable (the organizer can ask again); a 500 on register/login
        # is not.
        print(f"WARNING: failed to send email to {to!r} via Resend: {error}")


def send_verification_email(to: str, token: str) -> None:
    link = f"{APP_BASE_URL}/prototype/?verify_email={token}"
    _send(
        to,
        "Verify your OTRI organizer email",
        f'<p>Confirm your organizer account:</p><p><a href="{link}">{link}</a></p>'
        "<p>This link expires in 2 days.</p>",
    )


def send_report_email(to: str, kind: str, subject_label: str, message: str, page_url: str | None) -> None:
    """A new correction/removal request for the admins. Best effort, like every email here."""
    from html import escape

    link = f"{APP_BASE_URL}/prototype/organizer/#/admin"
    safe_page = escape(page_url, quote=True) if page_url and page_url.startswith(("http://", "https://")) else None
    _send(
        to,
        f"OTRI report: {kind} · {subject_label}"[:150],
        f"<p>Someone reported a <b>{escape(kind)}</b>: {escape(subject_label)}</p>"
        f"<p>{escape(message)}</p>"
        + (f'<p>Page: <a href="{safe_page}">{safe_page}</a></p>' if safe_page else "")
        + f'<p>Handle it in the <a href="{link}">admin dashboard</a>.</p>',
    )


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{APP_BASE_URL}/prototype/?reset_token={token}"
    _send(
        to,
        "Reset your OTRI password",
        f'<p>Reset your password:</p><p><a href="{link}">{link}</a></p>'
        "<p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>",
    )

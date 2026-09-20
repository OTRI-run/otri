"""Transactional email via Resend (https://resend.com): verification, password reset, sign-in
codes, and report notifications for admins.

Gated behind ``RESEND_API_KEY``, same pattern as ``OTRI_API_JWT_SECRET``: if unset, emails are
printed instead of sent (safe for local dev), with a loud warning so it is never silently broken
in a real deployment.

Every message is built from one layout (``_render``): a short heading, one or two sentences that
say what happened and what to do, one button, the same link in plain text for clients that strip
buttons, how long the link or code is valid, what to do if the reader did not ask for it, and a
footer that says why they received it. Each message also carries a plain-text alternative.
"""

from __future__ import annotations

import os
from html import escape

import resend

from . import db

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
EMAIL_FROM = os.environ.get("OTRI_EMAIL_FROM", "OTRI <noreply@otri.run>")
EMAIL_REPLY_TO = os.environ.get("OTRI_EMAIL_REPLY_TO", "hello@otri.run")
APP_BASE_URL = os.environ.get("OTRI_APP_BASE_URL", "http://localhost:5173")
SITE_URL = os.environ.get("OTRI_SITE_URL", "https://otri.run")
LOGO_URL = f"{SITE_URL}/email/otri-mark.png"

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    print(
        "WARNING: RESEND_API_KEY is not set - verification/password-reset emails "
        "will be printed to the console instead of sent. Set RESEND_API_KEY for a "
        "real deployment."
    )


# ----------------------------------------------------------------------------- layout

_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"


def _button(label: str, url: str) -> str:
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px">'
        "<tr><td style=\"border-radius:8px;background:#ee6b3b\">"
        f'<a href="{escape(url, quote=True)}" style="display:inline-block;padding:13px 26px;font-family:{_FONT};font-size:16px;'
        'font-weight:700;color:#17261f;text-decoration:none;border-radius:8px">'
        f"{escape(label)}</a></td></tr></table>"
    )


def _render(
    *,
    preheader: str,
    heading: str,
    paragraphs: list[str],
    cta: tuple[str, str] | None = None,
    code: str | None = None,
    after: list[str] = (),
    reason: str,
) -> tuple[str, str]:
    """Return (html, text) for one message. ``paragraphs`` and ``after`` are plain sentences and
    are escaped here; ``cta`` is (label, url)."""
    body = [f'<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#17261f">{escape(p)}</p>' for p in paragraphs]
    text = [heading, ""] + list(paragraphs)
    if code:
        body.append(
            '<p style="margin:24px 0;padding:18px 24px;border-radius:10px;background:#ebe6da;text-align:center;'
            f'font-family:{_MONO};font-size:32px;letter-spacing:8px;font-weight:700;color:#17261f">{escape(code)}</p>'
        )
        text += ["", f"    {code}", ""]
    if cta:
        label, url = cta
        body.append(_button(label, url))
        body.append(
            '<p style="margin:0 0 20px;font-size:13px;line-height:20px;color:#586057">Or copy this link into your browser:<br>'
            f'<a href="{escape(url, quote=True)}" style="font-family:{_MONO};font-size:12px;color:#245640;word-break:break-all">{escape(url)}</a></p>'
        )
        text += ["", f"{label}: {url}", ""]
    body += [f'<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#586057">{escape(p)}</p>' for p in after]
    text += list(after)

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f3efe6">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">{escape(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3efe6">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
    <td style="vertical-align:middle;padding-right:10px"><img src="{escape(LOGO_URL, quote=True)}" width="36" height="36" alt="OTRI" style="display:block;border:0"></td>
    <td style="vertical-align:middle;padding-right:12px;font-family:{_FONT};font-size:22px;font-weight:800;letter-spacing:-1px;color:#17261f">OTRI</td>
    <td style="vertical-align:middle;padding-right:12px"><div style="width:1px;height:26px;background:#ee6b3b;font-size:0;line-height:0">&nbsp;</div></td>
    <td style="vertical-align:middle;font-family:{_MONO};font-size:10px;letter-spacing:1.5px;line-height:14px;color:#245640">OPEN TRAIL<br>RUNNING INDEX</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #d9d3c6;border-radius:14px;padding:36px 36px 28px;font-family:{_FONT}">
  <h1 style="margin:0 0 18px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-.5px;color:#17261f">{escape(heading)}</h1>
  {''.join(body)}
</td></tr>
<tr><td style="padding:22px 8px 0;font-family:{_FONT};font-size:12px;line-height:18px;color:#586057">
  <p style="margin:0 0 8px">{escape(reason)}</p>
  <p style="margin:0">OTRI · Open Trail Running Index · <a href="{escape(SITE_URL, quote=True)}" style="color:#586057">otri.run</a> · <a href="mailto:{escape(EMAIL_REPLY_TO, quote=True)}" style="color:#586057">{escape(EMAIL_REPLY_TO)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    text += ["", "--", reason, f"OTRI · Open Trail Running Index · {SITE_URL} · {EMAIL_REPLY_TO}"]
    return html, "\n".join(text)


# ----------------------------------------------------------------------------- sending


def _send(to: str, subject: str, html: str, text: str, *, log_subject: str | None = None) -> None:
    """`log_subject` is what the email log keeps when the subject itself must not be kept."""
    logged = log_subject or subject
    if not RESEND_API_KEY:
        print(f"[email not sent - no RESEND_API_KEY] to={to!r} subject={subject!r}\n{text}")
        db.log_email(to, logged, "logged")
        return
    try:
        response = resend.Emails.send(
            {"from": EMAIL_FROM, "to": [to], "reply_to": EMAIL_REPLY_TO, "subject": subject, "html": html, "text": text}
        )
        provider_id = response.get("id") if isinstance(response, dict) else getattr(response, "id", None)
        db.log_email(to, logged, "sent", provider_id=provider_id)
        print(f"email sent to={to!r} subject={logged!r} resend_id={provider_id}")
    except resend.exceptions.ResendError as error:
        db.log_email(to, logged, "failed", error=str(error))
        # Never let an email-provider hiccup break registration/login/reset: log loudly and
        # continue. A failed verification/reset email is recoverable (the organizer can ask
        # again); a 500 on register/login is not.
        print(f"WARNING: failed to send email to {to!r} via Resend: {error}")


# ----------------------------------------------------------------------------- messages


def send_verification_email(to: str, token: str) -> None:
    link = f"{APP_BASE_URL}/prototype/?verify_email={token}"
    html, text = _render(
        preheader="One click to activate your organizer account.",
        heading="Confirm your email address",
        paragraphs=[
            f"Thanks for creating an OTRI organizer account. Confirm that {to} is your address and you can add your first event right away.",
        ],
        cta=("Confirm email address", link),
        after=[
            "The link is valid for 48 hours. If it has expired, request a new one from the sign-in page.",
            "If you did not create this account, no action is needed: the address stays unused and this is the last message you will receive from us.",
        ],
        reason="You received this email because this address was used to create an OTRI organizer account.",
    )
    _send(to, "Verify your email address for OTRI", html, text)


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{APP_BASE_URL}/prototype/?reset_token={token}"
    html, text = _render(
        preheader="Choose a new password for your OTRI organizer account.",
        heading="Reset your password",
        paragraphs=[
            f"We received a request to reset the password for {to}. Choose a new one with the button below.",
        ],
        cta=("Choose a new password", link),
        after=[
            "The link is valid for 1 hour and can be used once.",
            "If you did not request this, you can ignore this email. Your password stays as it is, and nobody can change it without access to this inbox.",
        ],
        reason="You received this email because a password reset was requested for your OTRI organizer account.",
    )
    _send(to, "Reset your OTRI password", html, text)


def send_login_code_email(to: str, code: str) -> None:
    html, text = _render(
        preheader="Enter this code to finish signing in. It expires in 10 minutes.",
        heading="Your sign-in code",
        paragraphs=["Enter this code to finish signing in to your OTRI organizer account:"],
        code=code,
        after=[
            "The code expires in 10 minutes and works once. Never share it: OTRI will never ask you for it by email or phone.",
            "If you were not signing in, someone may know your password. Change it from your account settings.",
        ],
        reason="You received this email because your OTRI organizer account uses email codes at sign-in.",
    )
    # The code is in the subject so it can be read off a lock screen. The log keeps the subject,
    # admins read the log and an account export contains it: the log gets the subject without the
    # code. The database stores the code as a keyed hash for the same reason.
    _send(to, f"{code} is your OTRI sign-in code", html, text, log_subject="Your OTRI sign-in code")


def send_report_email(to: str, kind: str, subject_label: str, message: str, page_url: str | None) -> None:
    """A new correction/removal request for the admins. Best effort, like every email here."""
    link = f"{APP_BASE_URL}/prototype/organizer/#/admin"
    safe_page = page_url if page_url and page_url.startswith(("http://", "https://")) else None
    html, text = _render(
        preheader=f"{kind}: {subject_label}",
        heading="A visitor sent a report",
        paragraphs=[
            f"Type: {kind}",
            f"About: {subject_label}",
            f"Message: {message}",
        ]
        + ([f"Page: {safe_page}"] if safe_page else []),
        cta=("Open the admin dashboard", link),
        after=["Reports are best answered within a few days; the reporter is waiting on the public page."],
        reason="You received this email because you are an OTRI admin.",
    )
    _send(to, f"New report: {kind} · {subject_label}"[:150], html, text)


def send_security_alert_email(to: str) -> None:
    """Ten wrong second-factor codes in a row: whoever typed them already had the password."""
    html, text = _render(
        preheader="Somebody who knows your password is guessing at your sign-in code.",
        heading="Someone may know your password",
        paragraphs=[
            f"Somebody signed in to {to} with the right password and then entered ten wrong sign-in codes. We have paused signing in with a code for this account for an hour.",
            "If that was you, wait an hour and try again, or use one of your recovery codes then.",
        ],
        cta=("Choose a new password", f"{APP_BASE_URL}/prototype/organizer/#/forgot"),
        after=[
            "If it was not you, your password is known to someone else. Your second factor kept them out. Choose a new password now, and change it wherever else you used the same one.",
        ],
        reason="You received this email because of repeated failed sign-in attempts on your OTRI organizer account.",
    )
    _send(to, "Someone may know your OTRI password", html, text)

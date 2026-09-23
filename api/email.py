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
from datetime import datetime
from html import escape
from urllib.parse import quote

import resend

from . import db

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
EMAIL_FROM = os.environ.get("OTRI_EMAIL_FROM", "OTRI <noreply@otri.run>")
EMAIL_REPLY_TO = os.environ.get("OTRI_EMAIL_REPLY_TO", "hello@otri.run")
APP_BASE_URL = os.environ.get("OTRI_APP_BASE_URL", "http://localhost:5173")
SITE_URL = os.environ.get("OTRI_SITE_URL", "https://otri.run")
# No logo image. The header is the wordmark as text, which every client renders: most block remote
# images until the reader allows them, so the mark was a blank box on first open, and a remote
# image is also what tells a sender the message was opened. public/email/otri-mark.png stays in
# place, unreferenced, so the images in mail already delivered do not turn into broken ones.

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
        "<tr><td style=\"border-radius:8px;background:#2563eb\">"
        f'<a href="{escape(url, quote=True)}" style="display:inline-block;padding:13px 26px;font-family:{_FONT};font-size:16px;'
        'font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">'
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
    body = [f'<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#334155">{escape(p)}</p>' for p in paragraphs]
    text = [heading, ""] + list(paragraphs)
    if code:
        body.append(
            '<p style="margin:24px 0;padding:18px 24px;border-radius:10px;background:#f1f5f9;text-align:center;'
            f'font-family:{_MONO};font-size:32px;letter-spacing:8px;font-weight:700;color:#0b1220">{escape(code)}</p>'
        )
        text += ["", f"    {code}", ""]
    if cta:
        label, url = cta
        body.append(_button(label, url))
        body.append(
            '<p style="margin:0 0 20px;font-size:13px;line-height:20px;color:#64748b">Or copy this link into your browser:<br>'
            f'<a href="{escape(url, quote=True)}" style="font-family:{_MONO};font-size:12px;color:#2563eb;word-break:break-all">{escape(url)}</a></p>'
        )
        text += ["", f"{label}: {url}", ""]
    body += [f'<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#64748b">{escape(p)}</p>' for p in after]
    text += list(after)

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f6fb">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">{escape(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fb">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
    <td style="vertical-align:middle;padding-right:12px;font-family:{_FONT};font-size:22px;font-weight:800;letter-spacing:-1px;color:#0b1220">OTRI</td>
    <td style="vertical-align:middle;padding-right:12px"><div style="width:1px;height:26px;background:#cbd5e1;font-size:0;line-height:0">&nbsp;</div></td>
    <td style="vertical-align:middle;font-family:{_MONO};font-size:10px;letter-spacing:1.5px;line-height:14px;color:#2563eb">OPEN TRAIL<br>RUNNING INDEX</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:36px 36px 28px;font-family:{_FONT}">
  <h1 style="margin:0 0 18px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-.5px;color:#0b1220">{escape(heading)}</h1>
  {''.join(body)}
</td></tr>
<tr><td style="padding:22px 8px 0;font-family:{_FONT};font-size:12px;line-height:18px;color:#94a3b8">
  <p style="margin:0 0 8px">{escape(reason)}</p>
  <p style="margin:0">OTRI · Open Trail Running Index · <a href="{escape(SITE_URL, quote=True)}" style="color:#64748b">otri.run</a> · <a href="mailto:{escape(EMAIL_REPLY_TO, quote=True)}" style="color:#64748b">{escape(EMAIL_REPLY_TO)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
    text += ["", "--", reason, f"OTRI · Open Trail Running Index · {SITE_URL} · {EMAIL_REPLY_TO}"]
    return html, "\n".join(text)


# ----------------------------------------------------------------------------- sending


def _for_log(address: str) -> str:
    """An address as the application log may hold it: enough to follow one delivery, not enough to
    be a list of everyone who ever signed up.

    The log used to carry the address in full on every send, while PRIVACY.md describes server logs
    as holding an address, a path and a time. The full address is already in the email_log row an
    admin can look up, so the application log does not need to repeat it.
    """
    name, _, domain = address.strip().lower().partition("@")
    if not domain:
        return "***"
    return f"{name[:2]}***@{domain}"


def _send(to: str, subject: str, html: str, text: str, *, log_subject: str | None = None) -> None:
    """`log_subject` is what the email log keeps when the subject itself must not be kept."""
    logged = log_subject or subject
    if not RESEND_API_KEY:
        # Deliberately without the body: it holds reset links and sign-in codes, and this
        # branch runs whenever the key is missing -- including by accident in production, which is
        # exactly when printing a live reset link would matter most.
        print(f"[email not sent - no RESEND_API_KEY] to={_for_log(to)} subject={subject!r}")
        db.log_email(to, logged, "logged")
        return
    try:
        response = resend.Emails.send(
            {"from": EMAIL_FROM, "to": [to], "reply_to": EMAIL_REPLY_TO, "subject": subject, "html": html, "text": text}
        )
        provider_id = response.get("id") if isinstance(response, dict) else getattr(response, "id", None)
        db.log_email(to, logged, "sent", provider_id=provider_id)
        print(f"email sent to={_for_log(to)} subject={logged!r} resend_id={provider_id}")
    except resend.exceptions.ResendError as error:
        db.log_email(to, logged, "failed", error=str(error))
        # Never let an email-provider hiccup break registration/login/reset: log loudly and
        # continue. A failed verification/reset email is recoverable (the organizer can ask
        # again); a 500 on register/login is not.
        print(f"WARNING: failed to send email to {_for_log(to)} via Resend: {error}")


# ----------------------------------------------------------------------------- messages


def send_verification_email(to: str, token: str) -> None:
    link = f"{APP_BASE_URL}/?verify_email={token}"
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
    link = f"{APP_BASE_URL}/?reset_token={token}"
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
    link = f"{APP_BASE_URL}/organizer/#/admin"
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
        after=["Reports are best answered within a few days. The reporter has no page to check and gets no further word unless an admin writes to them, so a removal request needs a reply as well as an action."],
        reason="You received this email because you are an OTRI admin.",
    )
    _send(to, f"New report: {kind} · {subject_label}"[:150], html, text)


def send_review_email(
    to: str,
    *,
    race_id: str,
    race_label: str,
    organizer_email: str,
    finisher_count: int,
    held: bool,
    flags: list[dict],
    auto_verify_at: datetime | None,
) -> None:
    """A race was published (or held): the admins hear about it. If nobody acts on a clean race it
    verifies itself at ``auto_verify_at``; a held race waits for a decision."""
    link = f"{APP_BASE_URL}/organizer/#/admin?tab=reviews&race={quote(race_id)}"
    reasons = [f"- {flag.get('severity', '').upper()}: {flag.get('detail', '')}" for flag in flags] or ["- nothing noted"]
    if held:
        heading = "A published race is held for review"
        preheader = f"Held: {race_label}"
        what = "It is not public. It stays down until you verify it, or reject it with a note the organizer receives."
    else:
        heading = "A race was published"
        preheader = f"Published: {race_label}"
        when = auto_verify_at.strftime("%Y-%m-%d %H:%M UTC") if auto_verify_at else "shortly"
        what = f"It is public now. If you do nothing it is marked verified automatically at {when}. Hold or reject it before then if something is wrong."
    html, text = _render(
        preheader=preheader,
        heading=heading,
        paragraphs=[
            f"Race: {race_label}",
            f"Organizer: {organizer_email}",
            f"Finishers: {finisher_count}",
            what,
            "What the automatic check noted:",
            *reasons,
        ],
        cta=("Open the reviews", link),
        after=["Verifying says only that an admin saw nothing wrong; OTRI approves nothing and the badge is not a certificate."],
        reason="You received this email because you are an OTRI admin.",
    )
    _send(to, f"{'Held' if held else 'Published'}: {race_label}"[:150], html, text)


def send_race_review_outcome_email(to: str, *, race_label: str, race_id: str, rejected: bool, note: str | None) -> None:
    """The organizer hears when an admin takes their race down, or lifts a hold."""
    link = f"{APP_BASE_URL}/organizer/#/races/{quote(race_id)}/review"
    if rejected:
        html, text = _render(
            preheader=f"{race_label} was taken down",
            heading="Your race was taken down",
            paragraphs=[
                f"An admin took “{race_label}” off the public site.",
                f"The note they left: {note or '(no note)'}",
                "Fix what the note describes and publish again; an admin will check it before it goes public. If you think this is wrong, reply to this email.",
            ],
            cta=("Open the race", link),
            reason="You received this email because your OTRI organizer account published this race.",
        )
        _send(to, f"Taken down: {race_label}"[:150], html, text)
    else:
        html, text = _render(
            preheader=f"{race_label} is public",
            heading="Your race is public",
            paragraphs=[
                f"An admin looked at “{race_label}” and it is on the public site now.",
            ],
            cta=("Open the race", link),
            reason="You received this email because your OTRI organizer account published this race.",
        )
        _send(to, f"Public: {race_label}"[:150], html, text)


def send_security_alert_email(to: str) -> None:
    """Ten wrong second-factor codes in a row: whoever typed them already had the password."""
    html, text = _render(
        preheader="Somebody who knows your password is guessing at your sign-in code.",
        heading="Someone may know your password",
        paragraphs=[
            f"Somebody signed in to {to} with the right password and then entered ten wrong sign-in codes. We have paused signing in with a code for this account for an hour.",
            "If that was you, wait an hour and try again, or use one of your recovery codes then.",
        ],
        cta=("Choose a new password", f"{APP_BASE_URL}/organizer/#/forgot"),
        after=[
            "If it was not you, your password is known to someone else. Your second factor kept them out. Choose a new password now, and change it wherever else you used the same one.",
        ],
        reason="You received this email because of repeated failed sign-in attempts on your OTRI organizer account.",
    )
    _send(to, "Someone may know your OTRI password", html, text)


def send_password_changed_email(to: str, *, after_reset: bool = False) -> None:
    """The account's password just changed, so the address it belongs to is told.

    Changing the password is how somebody who has got into an account keeps the owner out of it:
    the old password stops working and every other session ends. Until now that happened in
    silence, and the owner found out when they next failed to sign in. This is the warning, and it
    goes to the mailbox, which is the one thing the intruder may not have.

    `after_reset` is the reset-link path. The owner asked for that one from this mailbox, so the
    wording says so rather than implying something went wrong.
    """
    lead = (
        "The password for your OTRI organizer account was just reset, from the link we sent to this address."
        if after_reset
        else "The password for your OTRI organizer account was just changed."
    )
    html, text = _render(
        preheader="The password on your OTRI account has changed.",
        heading="Your password was changed",
        paragraphs=[
            f"{lead} Everywhere else that was signed in has been signed out.",
            "If that was you, there is nothing to do.",
        ],
        cta=("Set a new password", f"{APP_BASE_URL}/organizer/#/forgot"),
        after=[
            "If it was not you, somebody else is in your account. Set a new password from this mailbox with the button "
            "above, which signs them out, and then turn on two-factor sign-in from the account page.",
        ],
        reason="You received this email because the password on your OTRI organizer account changed.",
    )
    _send(to, "Your OTRI password was changed", html, text)


def send_google_linked_email(to: str, *, reclaimed: bool) -> None:
    """A Google account was just joined to this address. The owner of the mailbox is told either
    way; when the account had never confirmed its address, they are told the old password and
    second factor were removed too, because whoever set them had never shown they own the address."""
    if reclaimed:
        paragraphs = [
            f"Someone signed in to OTRI with a Google account for {to}, which Google has verified. There was already an OTRI organizer account at this address, but its email had never been confirmed, so we treated the Google sign-in as the confirmation.",
            "The password that account had, and any two-factor setup, were removed and every session was signed out. From now on this account signs in with Google. You can set a password again from the account page.",
        ]
        after = ["If this was not you, someone with access to your Google account signed in to OTRI. Secure your Google account first, then write to us."]
        preheader = "Google sign-in was added to your OTRI account, and the old password was removed."
    else:
        paragraphs = [
            f"Google sign-in was added to the OTRI organizer account for {to}. From now on you can sign in with either your password or your Google account.",
        ]
        after = ["If this was not you, sign in with your password, sign out everywhere from the account page, and write to us."]
        preheader = "Google sign-in was added to your OTRI account."
    html, text = _render(
        preheader=preheader,
        heading="Google sign-in was added",
        paragraphs=paragraphs,
        cta=("Open your account", f"{APP_BASE_URL}/organizer/#/account"),
        after=after,
        reason="You received this email because a Google account was linked to your OTRI organizer account.",
    )
    _send(to, "Google sign-in was added to your OTRI account", html, text)


def send_google_link_email(to: str, link: str, *, unconfirmed: bool) -> None:
    """Somebody signed in with a Google account carrying this address, and Google does not run the
    mailbox: it checked the address once and cannot say who reads it today. So we ask the mailbox.
    Opening the link joins that Google account to this one; ignoring it changes nothing."""
    lead = (
        "Somebody signed in with a Google account that uses this address and asked to connect it to an OTRI account with the same address."
        if not unconfirmed
        else "Somebody signed in with a Google account that uses this address. An OTRI account was registered with this address but never confirmed."
    )
    after = ["If this was not you, ignore this email. Nothing has been connected and nothing has changed."]
    if unconfirmed:
        after.insert(0, "Opening the link also confirms the address and takes the account over: any password or second factor set on it stops working, because nobody had ever shown they read this mailbox.")
    html, text = _render(
        preheader="Connect your Google account to OTRI",
        heading="Is this your Google account?",
        paragraphs=[lead, "If it was you, open the link below. It works once and expires in an hour."],
        cta=("Connect my Google account", link),
        after=after,
        reason="You received this email because somebody asked to connect a Google account to an OTRI account with this address.",
    )
    _send(to, "Connect your Google account to OTRI", html, text)

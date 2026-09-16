# Privacy Policy (Draft)

**This is a first draft, not a legally reviewed document.** See `DATA_POLICY.md`'s "Legal review" section — get qualified legal advice before relying on this for a real public launch, especially regarding GDPR/international requirements if organizers or runners outside your home jurisdiction can sign up.

This page describes what personal data OTRI collects and why. For race-result data specifically (athlete names, times, etc.), see `DATA_POLICY.md`.

## What we collect

**Organizer accounts** (`POST /auth/register`):
- Email address
- Password (never stored in plain text — hashed with `bcrypt` before saving)
- Account creation timestamp

**Race/result submissions**: race metadata and result files organizers choose to submit (see `DATA_POLICY.md` for how athlete data within those files is handled).

**Server logs**: standard web server access logs (IP address, request path, timestamp) for operational/security purposes (e.g. the rate limiter in `api/rate_limit.py` uses request IP to throttle abuse). Not used for tracking or analytics.

We do not use cookies, third-party analytics, or advertising trackers.

## Why we collect it

- **Email + password**: to authenticate organizers and let them manage their races/results.
- **Race/result data**: to compute and publish OTRI scores, per `HANDBOOK.md`'s core purpose.
- **IP address (transient, in logs/rate-limiter)**: to prevent abuse (e.g. brute-force login attempts).

## Who else sees it

- **[Resend](https://resend.com)** — sends verification and password-reset emails on our behalf. Resend receives the organizer's email address and the email content (see Resend's own privacy policy for how they handle it).
- **Hosting provider** (e.g. DigitalOcean) — stores the database and server logs as part of running the service.
- We do not sell or share personal data with anyone else.

## How long we keep it

- Organizer accounts: until the organizer asks for deletion, or the account has been inactive for an extended period (no automated deletion policy exists yet — this is a gap to close before a real launch).
- Password reset tokens: expire after 1 hour and are deleted after 2 hours; used tokens are marked and rejected on reuse.
- Email verification tokens: expire after 2 days.

## Your rights

You can ask us to:
- Tell you what data we hold about your organizer account.
- Correct inaccurate data.
- Delete your account and associated data.

There is currently no self-service way to do this in the product — contact `hello@otri.run` (see `README.md`'s footer) until one exists.

## Security

Passwords are hashed with `bcrypt`, never stored or logged in plain text. Sessions use signed JWTs (`OTRI_API_JWT_SECRET`). See `SECURITY.md` for how to report a vulnerability.

## Changes to this policy

This is a living document during OTRI's prototype phase. Material changes will be noted in `CHANGELOG.md`.

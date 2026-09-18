# Privacy Policy (Draft)

**This is a first draft, not a legally reviewed document.** See `DATA_POLICY.md`'s "Legal review" section — get qualified legal advice before relying on this for a real public launch, especially regarding GDPR/international requirements if organizers or runners outside your home jurisdiction can sign up.

This page describes what personal data OTRI collects and why. For race-result data specifically (athlete names, times, etc.), see `DATA_POLICY.md`.

## What we collect

**Organizer accounts** (`POST /auth/register`):
- Email address
- Password (never stored in plain text — hashed with `bcrypt` before saving; must be 10+ characters and not a common password)
- Account creation timestamp
- Optional profile details the organizer chooses to add (name, organization, website, country, short bio). Organization and website are shown next to the organizer's published races; the rest is visible only to admins.
- If two-factor authentication is switched on: an authenticator secret or the hash of a one-time email code, and hashed recovery codes.
- The time you accepted `TERMS.md` and this policy at sign-up.
- Whether you asked for OTRI news, and when. This is off unless you tick the box at sign-up or in your account settings, and you can untick it there at any time; the timestamp is cleared when you do.

**Race/result submissions**: race metadata and result files organizers choose to submit (see `DATA_POLICY.md` for how athlete data within those files is handled). From a results file OTRI keeps each finisher's names, gender, finish time and rank, and, when supplied, the **year** of birth and a country code, never the full date of birth.

**Runner profiles**: results from races an organizer has published are grouped into a runner profile (name, gender, country, age category, published results and the runner index described in `docs/methodology/RUNNER-INDEX-v1.md`). Profiles show nothing that is not already on a published leaderboard. A runner can ask for a profile to be removed or corrected with the "Report a problem" form on every profile, leaderboard and shared course (or at hello@otri.run); reports go only to the OTRI admins, who can delete the data from the admin dashboard. Unpublishing a race removes its results from every profile immediately.

**Score calculator uploads** (`POST /gpx/analyze`): a GPX file you upload is measured and then discarded; it is not linked to any account. If you click **Share this score**, the file is stored (`POST /gpx/share`) under an id derived from its contents so the link can reopen it, together with the course name you saw on screen. Anyone with the link can view that course. The target time travels in the link, not on the server. Shared courses are stored compressed under a total size budget; when it is full the oldest ones are deleted, so old links can stop working. Email hello@otri.run to have a shared course removed sooner.

**Server logs**: standard web server access logs (IP address, request path, timestamp) for operational/security purposes (e.g. the rate limiter in `api/rate_limit.py` uses request IP to throttle abuse). Not used for tracking or analytics.

The only cookie is `otri_session`, set by the API when an organizer signs in on the organizer site and needed for that sign-in to work (strictly necessary; HttpOnly, so page scripts cannot read it; it expires with the session). We do not use third-party analytics or advertising trackers.

## Why we collect it

- **Email + password**: to authenticate organizers and let them manage their races/results.
- **Race/result data**: to compute and publish OTRI scores, per `HANDBOOK.md`'s core purpose.
- **IP address (transient, in logs/rate-limiter)**: to prevent abuse (e.g. brute-force login attempts).
- **Newsletter consent**: so that marketing email about OTRI goes only to organizers who asked for it. Admins can export the list of consenting, verified accounts (`GET /admin/newsletter.csv`) to send such email; it is never shared beyond the email provider below.

## Who else sees it

- **[Resend](https://resend.com)** — sends verification, password-reset, sign-in-code and, for organizers who opted in, news emails on our behalf. Resend receives the organizer's email address and the email content (see Resend's own privacy policy for how they handle it).
- **Hosting provider** (e.g. DigitalOcean) — stores the database and server logs as part of running the service.
- We do not sell or share personal data with anyone else.

## How long we keep it

- Organizer accounts: until the organizer asks for deletion, or the account has been inactive for an extended period (no automated deletion policy exists yet — this is a gap to close before a real launch).
- Password reset tokens: expire after 1 hour and are deleted after 2 hours; used tokens are marked and rejected on reuse.
- Email verification tokens: expire after 2 days.
- Shared calculator courses: until removed on request, or evicted oldest-first once the storage budget (`OTRI_SHARED_COURSES_MAX_MB`, default 2048) is full.

## Your rights

You can ask us to:
- Tell you what data we hold about your organizer account.
- Correct inaccurate data.
- Delete your account and associated data.

Organizers can do the last two themselves on the account page: **Download my data** gives a JSON file with the account, consents, events, races, result rows and the emails we sent; **Delete my account** removes everything the account owns after a password check. For anything else, or as a runner, contact `hello@otri.run`.

We keep a log of every email sent (recipient, subject, provider message id, outcome) so delivery problems can be traced; it is visible to admins only.

## Security

Passwords are hashed with `bcrypt`, never stored or logged in plain text. Sessions use signed JWTs (`OTRI_API_JWT_SECRET`). See `SECURITY.md` for how to report a vulnerability.

## Changes to this policy

This is a living document during OTRI's prototype phase. Material changes will be noted in `CHANGELOG.md`.

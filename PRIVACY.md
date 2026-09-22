# Privacy Policy (Draft)

**This is a first draft, not a legally reviewed document.** It describes accurately what the software does, and it has not been checked by a lawyer. See `DATA_POLICY.md`'s "Legal review" section: qualified advice is needed before a real public launch, particularly on GDPR and on the other places organizers and runners sign up from.

This page describes what personal data OTRI collects and why. For race-result data specifically (athlete names, times, etc.), see `DATA_POLICY.md`.

## What we collect

**Organizer accounts** (`POST /auth/register`):
- Email address
- Password (never stored in plain text — hashed with `bcrypt` before saving; must be 10+ characters and not a common password)
- Account creation timestamp
- Optional profile details the organizer chooses to add (name, organization, website, country, short bio). **Organization and website are public**: they are shown next to the organizer's published races. The name, country and bio are visible only to OTRI admins and are never published; if the organization is left blank, no name appears on the race page at all.
- If two-factor authentication is switched on: an authenticator secret or the hash of a one-time email code, and hashed recovery codes.
- The time you accepted `TERMS.md` and this policy at sign-up.
- Whether you asked for OTRI news, and when. This is off unless you tick the box at sign-up or in your account settings, and you can untick it there at any time; the timestamp is cleared when you do.

**Race/result submissions**: race metadata and result files organizers choose to submit (see `DATA_POLICY.md` for how athlete data within those files is handled). From a results file OTRI keeps each finisher's names, gender, finish time and rank, and, when supplied, the bib number, the **year** of birth and a country code, never the full date of birth. The bib number is shown on the public leaderboard and in the scored CSV.

**Runner profiles**: results from races an organizer has published are grouped into a runner profile (name, gender, country, age category, published results and the runner index described in `docs/methodology/runner-index/RUNNER-INDEX-v1.md`). Profiles show nothing that is not already on a published leaderboard. A runner can ask for a profile to be removed or corrected with the "Report a problem" form on every profile, leaderboard and shared course (or at hello@otri.run); reports go only to the OTRI admins, who can delete the data from the admin dashboard. Unpublishing a race removes its results from every profile at once, and also takes back any year of birth or country that race had contributed to the profile. Public pages are cached for up to about a minute and a half at the front door, so a page someone has just loaded can take that long to catch up.

**Score my race** (`POST /score`): the course file and the results file you upload are checked, scored and deleted before the answer is sent. No race, result or runner is recorded, the names in the file are never written to the database, and nothing is linked to an account or published. The scored list exists only in the answer your browser or program receives.

If you then press **Publish this race**, the two files are kept in your own browser (its IndexedDB, under `otri-publish`) so the organizer app can create the race page without a second upload. They are not sent anywhere by that step; they reach OTRI only through your signed-in uploads, and they are deleted from the browser as soon as the race page exists, when you press "Throw it away", or the next time you open any OTRI page after they are a day old.

**Score calculator uploads** (`POST /gpx/analyze`): a GPX file you upload is measured and then discarded; it is not linked to any account. If you click **Share this score**, the file is stored (`POST /gpx/share`) under an id derived from its contents so the link can reopen it, together with the course name you saw on screen. Anyone with the link can view that course. Before any course file is stored (a shared course, or a race's course uploaded by its organizer) it is reduced to its track: positions and elevations only. Timestamps, the author's and device's names, heart rate and other sensor data, waypoints and notes are not kept in the stored file and are never served. Nothing about the file's origin is kept for a shared course, and neither is the name of the file you uploaded. (For a course an organizer attaches to a race, the origin details are kept privately so a licence question can be answered; see `DATA_POLICY.md`.) The target time travels in the link, not on the server. Shared courses are stored compressed under a total size budget; when it is full the oldest ones are deleted, so old links can stop working. Email hello@otri.run to have a shared course removed sooner.

**Server logs**: standard web server access logs (IP address, request path, timestamp) for operational/security purposes. They record the path only and never the query string, so the one-time links OTRI emails do not end up in a log. The application log shortens email addresses (`ab***@example.com`) rather than writing them out. The rate limiter in `api/rate_limit.py` throttles abuse per address, and stores a digest of the address rather than the address itself. Not used for tracking or analytics.

OTRI sets cookies only where one is needed to make something work, never for analytics or advertising. All three are HttpOnly, so page scripts cannot read them, and all three are set by the API:

- `otri_session` — an organizer's sign-in. It lasts as long as the browser session, or 30 days if you tick "remember me" when you sign in.
- `otri_oauth` — 10 minutes, during a Google sign-in only. It ties the trip to Google to the browser that started it, which is what stops somebody else's sign-in landing in your browser.
- `otri_oauth_hint` — 10 minutes, after a Google sign-in, holding the address that sign-in ended on so the next page can show it. It is read once and deleted.

We do not use third-party analytics or advertising trackers.

**Counting visits**: OTRI counts how many people use the site, with its own code (`api/analytics.py`), and hands nothing to anybody else. Opening a page tells the API the path you are on, the site you came from if any (its address only, never a search you typed), your browser's time zone setting, and what the browser says it is. Nothing is written to your browser: no cookie, no stored identifier, nothing that is still there when you come back.

So that the same person is not counted twice in a day, the API makes a number out of the date, a secret, your network address and your browser's description, keeps only that number, and throws the rest away. The date is inside it, so the number is different tomorrow and today's visit cannot be joined to any other day's. Those numbers are deleted after three days; what is left is the count itself, which is nobody's. If your browser sends "Do Not Track" or Global Privacy Control, nothing is sent at all.

Alongside the counts the API keeps a tally of what was done: how many courses were measured, results files scored, races published and accounts made, per day. Those are totals with nothing attached to them.

## Why we collect it

- **Email + password**: to authenticate organizers and let them manage their races/results.
- **Race/result data**: to compute and publish OTRI scores, per `HANDBOOK.md`'s core purpose.
- **IP address**: to prevent abuse (e.g. brute-force login attempts). The rate limiter never stores the address itself, only a digest of it, and those rows are removed within about two days.
- **Newsletter consent**: so that marketing email about OTRI goes only to organizers who asked for it. Admins can export the list of consenting, verified accounts (`GET /admin/newsletter.csv`) to send such email; it is never shared beyond the email provider below.

## Who else sees it

- **[Resend](https://resend.com)** — sends verification, password-reset, sign-in-code and, for organizers who opted in, news emails on our behalf. Resend receives the organizer's email address and the email content (see Resend's own privacy policy for how they handle it).
- **Hosting provider** (e.g. DigitalOcean) — stores the database and server logs as part of running the service.
- **Sentry**, when the deployment is configured with it — receives error reports: a stack trace, the page or request that failed, and, because the report is sent from your browser, your network address. It is set to send no personal data with the report and to record no session replay. An admin can see on the dashboard whether it is switched on.
- Places your **browser** fetches files from directly, which means those services see your network address and which file you asked for. They receive nothing else and are not sent anything about you:
  - **OpenFreeMap** and **AWS open data** — map tiles and terrain, on any page showing a course map.
  - **Google Fonts** — the heading typeface, on the policy pages only (this page, `/terms/` and `/data-policy/`).
  - **jsDelivr** — the viewer on the API documentation page.
- We do not sell personal data, and we share it with nobody beyond the above.

## How long we keep it

- Organizer accounts: until the organizer asks for deletion, or the account has been inactive for an extended period (no automated deletion policy exists yet — this is a gap to close before a real launch).
- Password reset tokens: expire after 1 hour and are deleted once expired, the next time any reset is requested; used tokens are marked and rejected on reuse.
- Email verification tokens: expire after 2 days, and are deleted on the same occasion.
- Visit counting: the per-visitor number described above is deleted after three days. The daily totals it was counted into are kept, and they are nobody's.
- Email delivery log (who was sent what, and whether it arrived): kept indefinitely, admin-only. This has no retention schedule yet.
- Reports sent with the "Report a problem" form, including the reporter's address if they gave one: kept until an admin deletes them. This has no retention schedule yet.
- Server logs: kept for as long as the server's own log rotation keeps them; OTRI sets no separate period.
- Database backups: a nightly copy of everything, kept 30 days. A deletion therefore takes up to a month to work its way out of the backups.
- Shared calculator courses: until removed on request, or evicted oldest-first once the storage budget (`OTRI_SHARED_COURSES_MAX_MB`, default 2048) is full.

## Your rights

You can ask us to:
- Tell you what data we hold about your organizer account.
- Correct inaccurate data.
- Delete your account and associated data.

Organizers can do the last two themselves on the account page, and both ask for the password first:

- **Download my data** gives a JSON file with the account, its consents, any sign-in linked to it, the events and races it owns, every result row in them, and the most recent 200 emails we sent. The file says what it leaves out: the password hash, any two-factor secret and the recovery codes, which exist to protect the account and are not handed out. Stored course files are not in it; ask at `hello@otri.run` and we will send them.
- **Delete my account** removes everything the account owns. An account that signs in with Google has no password: the account page will email a link to set one, and it says so. What survives a deletion, and why: rows in the email delivery log and in the abuse counters are keyed to the address so that delivery problems and lockouts can still be explained, and the nightly backups keep a copy of everything for 30 days.

For anything else, or as a runner, contact `hello@otri.run`.

We keep a log of every email sent (recipient, subject, provider message id, outcome) so delivery problems can be traced; it is visible to admins only.

## Security

Passwords are hashed with `bcrypt`, never stored or logged in plain text. Sessions use signed JWTs (`OTRI_API_JWT_SECRET`). See `SECURITY.md` for how to report a vulnerability.

## Changes to this policy

This is a living document during OTRI's prototype phase. Material changes will be noted in `CHANGELOG.md`.

## Signing in with Google

Organizers may sign in with a Google account instead of, or as well as, a password. When they do,
OTRI receives from Google a stable account identifier, the account's email address and the display
name on it, and **keeps only the first two**, so the same Google account opens the same OTRI
account next time. The display name is discarded: it is never stored, shown or used. Nothing else
from the Google account is read or kept: no contacts, no calendar, no files, and no access token
or refresh token, because OTRI never calls Google's services after the sign-in itself. Google is
told only that a sign-in to OTRI happened. Google's own script is never loaded on OTRI's pages.

An OTRI account created this way has no password until its owner chooses to set one from the
account page. Setting one matters for more than convenience: signing out everywhere, turning on
two-factor sign-in, downloading your data and deleting the account all ask for a password, and the
account page offers to email a link to choose one.

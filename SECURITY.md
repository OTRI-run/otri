# Security Policy

## Reporting a vulnerability

Please do not put vulnerability details in a public issue. Email **hello@otri.run** with "Security" in the subject; you will get an answer within a few days, and a fix or a plan before anything is published.

Include the affected part (the site, the organizer app, the API at `api.otri.run`, the scoring code), a concise reproduction, the impact you see, and any suggested mitigation. Do not include passwords, private athlete data, access tokens or other secrets, and do not test against other people's accounts or published data.

What is in scope: everything in this repository and the deployment described in `docs/operations/`. What the API deliberately does, and why, is written down in `api/README.md` ("Authentication", "Uploads and hardening"); a report that one of those decisions is wrong is welcome too.

## Data security

OTRI keeps as little personal data as it can (`PRIVACY.md`), never commits secrets or private athlete data to the repository, and re-computes every score from the raw files so nobody can supply one. Deployment secrets live in the server's `.env`, never in git; a key that reaches the repository is rotated.

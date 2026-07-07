# Data Breach Response Plan (Internal)

Not published to users. Keep this updated as infrastructure changes.

## 1. What counts as a breach

Unauthorized access to or disclosure of: user emails, password hashes, JWT signing keys, Stripe customer IDs, or the Postgres database itself. A leaked Cloudflare R2 bucket of audio files is not a breach (no personal data), but a leaked DB dump or backup is.

## 2. Immediate steps (first 24 hours)

1. Rotate the affected credential first: DB password, JWT signing secret, Stripe API key, R2 access keys, whichever was exposed.
2. Revoke all active refresh tokens if JWT secret or session data is compromised, forcing re-login.
3. Take a snapshot of logs and the affected system state before remediating, for later investigation.
4. Patch the vulnerability (dependency, misconfigured bucket, leaked env var, etc.).

## 3. Assess scope

- Which tables/fields were exposed (emails only, or hashes too).
- How many users affected.
- Whether Stripe data was touched (if so, also notify Stripe per their terms).

## 4. Notification obligations

- **GDPR** (if any EU/UK users affected): notify the relevant supervisory authority within 72 hours of becoming aware, if there's risk to individuals. Notify affected users "without undue delay" if the risk is high.
- **US state laws** (vary by state): most require notifying affected residents "without unreasonable delay," some with a hard deadline (e.g., 30-45 days). Check the laws of any state with affected users; California, New York, and a few others have stricter/faster requirements.
- **CCPA**: notify affected California residents if personal information was breached due to a failure to maintain reasonable security.

When in doubt, notify sooner rather than later, and lead with what happened, what data was affected, what you've done, and what users should do (e.g., reset password).

## 5. User notification template (fill in when needed)

Subject: Important security update about your Slonbelka account

We recently discovered [brief description]. Here's what happened, what data may have been affected, and what we're doing about it: [details]. We recommend you [reset your password / take other action]. Contact [SUPPORT EMAIL] with questions.

## 6. Post-incident

- Document root cause and fix.
- Update this plan if the process revealed gaps.

# Supabase backend (Room Repeater)

Two projects, both **EU Central (Frankfurt)**, free plan:

| Project | Used by | Site URL | Redirect URLs (exact, nothing else) |
|---|---|---|---|
| `rr-nonprod` | DEV + UAT | `https://korkovik.github.io/room-repeater/uat/` | `https://korkovik.github.io/room-repeater/dev/` · `https://korkovik.github.io/room-repeater/uat/` |
| `rr-prod` | PROD (from I4) | `https://korkovik.github.io/room-repeater/` | `https://korkovik.github.io/room-repeater/` |

Only two values leave the dashboard: **Project URL** and the **anon (public) key** (Project Settings → API). They go into `RR_BACKENDS` in the page. The service-role key, the database password and the SMTP password never go into the repo, the page, the board or a chat.

## Run the migration
1. Dashboard → **SQL Editor** → New query.
2. Paste the whole of `migrations/001_i1_accounts.sql` → **Run**. It should end with `COMMIT` and no error. Running it twice is safe.
3. Check: **Table Editor** shows `profiles, children, turns, gifts, dropped`, each marked "RLS enabled"; **Authentication → Policies** lists 2–3 policies per table.

Run it on `rr-nonprod` now; on `rr-prod` only at the I4 go-live.

## Dashboard settings (per project)
Menu labels are from the Supabase dashboard as of 2026 (my knowledge; names can move slightly).

**Authentication → Sign In / Providers**
- *Allow new users to sign up*: **OFF** (invite-only, S3). The app also calls `signInWithOtp` with `shouldCreateUser:false`.
- *Allow anonymous sign-ins*: OFF. Phone and all social providers: OFF.
- Email provider: ON. *Email OTP expiration*: **3600** s. *Email OTP length*: **6**.

**Authentication → URL Configuration**
- *Site URL* and *Redirect URLs*: exactly as in the table above (S4). No wildcards, no `localhost`.

**Authentication → Emails → Templates**
- *Magic Link* template body (keep the link, add the code for phones that open mail in another browser):
  ```html
  <h2>Sign in to Room Repeater</h2>
  <p><a href="{{ .ConfirmationURL }}">Open Room Repeater</a></p>
  <p>Or type this code in the app: <strong>{{ .Token }}</strong></p>
  <p>The link and code work for 1 hour. If you did not ask for this, ignore this email.</p>
  ```
- *Invite user* template: same text, first line "You are invited to the Room Repeater pilot".

**Authentication → Emails → SMTP** — the built-in sender only delivers to members of your Supabase organisation and a few emails per hour. Fine for Tom's own test inboxes on `rr-nonprod`; a custom SMTP sender is needed before real parents are invited (I4).

**Authentication → Sessions / Rate limits** — keep the defaults: JWT expiry 3600 s, refresh-token rotation ON, no time-box or inactivity timeout (sessions last until sign-out, meets AC3's 30 days), 60 s minimum between emails to the same address (matches the app's "Send again" timer).

## Inviting a parent (Tom only)
Authentication → Users → **Invite user** → email. The trigger in the migration creates their `profiles` row. `asr_allowed` stays `false`; flip it only in Table Editor → profiles (the app cannot change it).

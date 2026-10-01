# Room Repeater — environments

Two environments: **DEV** (non-prod) and **PROD**. There is no UAT.

| Env | URL | Backend | Browser storage key |
|---|---|---|---|
| PROD | https://korkovik.github.io/room-repeater/ | none yet (no accounts; `rr-prod` from I4) | `rr-pilot-v1` (unchanged) |
| DEV | https://korkovik.github.io/room-repeater/dev/ | Supabase `rr-nonprod` (invite-only sign-in) | `rr-acct-dev` (signed in) · `rr-pilot-v1-dev` (`?backend=off`) |

DEV shows a purple banner; PROD has none. Each environment keeps its own saved progress, so testing on DEV never touches PROD data, even on the same phone.

DEV URL options:
- `?backend=off`: no accounts, exactly how PROD behaves today. Use this for the final check before promoting.
- `?backend=stub`: a pretend sign-in that stays in the browser (parent1@example.test, code 123456), for testing without real email.

GitHub Pages publishes from the **`dev` branch**, folder `/`. Everything below happens on that branch. (The `dev/` *folder* is the DEV environment; the `dev` *branch* holds both.)

## Release flow
1. A new build goes into `dev/index.html` and is checked on `/dev/`, signed in and with `?backend=off`.
2. When happy: **Actions → Promote Room Repeater → Run workflow → `prod`** copies `dev/` to the live `index.html`. The site updates in about a minute.

Without the workflow: `./promote.sh prod`, then commit and push to the `dev` branch.

PROD always runs without accounts for now, even though the DEV build contains the sign-in code (the page switches it off on the PROD URL).

## Rollback
`git revert` the "Promote to prod" commit on the `dev` branch and push.

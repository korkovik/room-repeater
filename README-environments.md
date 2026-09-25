# Room Repeater — environments

| Env | URL | Browser storage key |
|---|---|---|
| PROD | https://korkovik.github.io/room-repeater/ | `rr-pilot-v1` (unchanged) |
| UAT | https://korkovik.github.io/room-repeater/uat/ | `rr-pilot-v1-uat` |
| DEV | https://korkovik.github.io/room-repeater/dev/ | `rr-pilot-v1-dev` |

DEV shows a purple banner, UAT an orange one; PROD looks as before. Each environment keeps its own saved progress, so testing on DEV or UAT never touches PROD data, even on the same phone.

GitHub Pages publishes from the **`dev` branch**, folder `/`. Everything below happens on that branch. (The `dev/` *folder* is the DEV environment; the `dev` *branch* holds all three.)

## Release flow
1. A new build goes into `dev/index.html` and is checked on `/dev/`.
2. **Actions → Promote Room Repeater → Run workflow → `uat`** copies `dev/` to `uat/`.
3. Test on `/uat/`.
4. When happy: **Run workflow → `prod`** copies `uat/` to the live `index.html`. The site updates in about a minute.

Without the workflow: `./promote.sh uat` or `./promote.sh prod`, then commit and push to the `dev` branch.

## Rollback
`git revert` the "Promote to prod" commit on the `dev` branch and push.

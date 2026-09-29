# Family Buddy

A small, free parenting companion for children aged 1 to 5 (CS/EN). A parent enters a child's name (or nickname) and date of birth, and the app shows what many children around that age tend to do, three things that matter now, ideas to do together indoors and outdoors, and a link to Room Repeater. The data stays on the device (localStorage). There are no accounts, no backend and no analytics.

This folder is self-contained. Nothing outside `family-buddy/` belongs to it, and Room Repeater's files (`../index.html`, `../dev/`, `../uat/`, `../promote.sh`) are never touched.

## Environments

| Env | URL | Storage key | Chrome |
|---|---|---|---|
| Local | http://localhost:4173/room-repeater/family-buddy/dev/ (`npm run serve`) | `fb-v1-dev` | purple banner, noindex |
| DEV | https://korkovik.github.io/room-repeater/family-buddy/dev/ | `fb-v1-dev` | purple banner, noindex, no service worker |
| UAT | https://korkovik.github.io/room-repeater/family-buddy/uat/ | `fb-v1-uat` | orange banner, noindex |
| PROD | https://korkovik.github.io/family-buddy/ (repo `korkovik/family-buddy`, go-live step) | `fb-v1` | none |

`js/env.js` detects the environment from the path (`/dev/` or `/uat/` segment) and adds the banner and `<meta name="robots" content="noindex">` at runtime. The HTML files never contain a static noindex, because the same files are promoted byte for byte.

## Layout

```
dev/                  the app, served as-is (edit only here)
  index.html          app shell
  privacy.cs.html     privacy notice (legal text, word for word), static, loads only js/env.js
  privacy.en.html
  css/app.css
  js/env.js           environment, storage key, Room Repeater URL, banner + noindex
  js/age.js           pure age rules on YYYY-MM-DD strings (R8–R11)
  js/validate.js      name and date-of-birth validation (R5, R6)
  js/select.js        content types, shape checks, stage/activity/RR selection (R12, R16, R17, R20)
  js/storage.js       profile load/save/forget with an injectable Storage (R27–R29)
  js/i18n.js          dictionaries, {var} formatting, long dates
  js/app.js           screens and wiring (textContent only, no innerHTML)
  i18n/{cs,en}.json   all UI strings incl. the legal strings
  content/stage-plan.json, content/{cs,en}/{stages,activities}.json
uat/                  created by scripts/promote.sh uat, never edited by hand
scripts/validate-content.mjs   content rules C1–C7, --release adds C12
scripts/reviewers.json         human reviewers allowed by --release
scripts/promote.sh             uat: validate --release, then copy dev/ → uat/; prod: refused
ops/ci-family-buddy.yml        optional GitHub Actions workflow for Tom to upload
tests/unit/*.test.mjs          node --test
tests/e2e/*.spec.ts            Playwright (iPhone 13 viewport)
tests/fixtures/dob.json        date-of-birth fixtures (today = 2026-10-15)
```

## Checks

```
npm ci
npm run check        # tsc (JSDoc, strict) + eslint + node --test + content validator
npm run test:e2e     # Playwright; starts tests/e2e/server.mjs on port 4173
FB_E2E_WEBKIT=1 npm run test:e2e   # also runs WebKit when it is installed
npm run validate:release           # C12 gate; fails until Tom has reviewed and the placeholders are filled
```

The e2e server serves the same `dev/` build at `/room-repeater/family-buddy/dev/`, `/room-repeater/family-buddy/uat/` and `/family-buddy/`, so all three environments can be tested locally.

Note for `jsconfig.json`: the `paths` entry for `punycode` points tsc at Node's own type declarations; without it, tsc type-checks the unrelated npm `punycode` package that ESLint pulls in.

## Content rules

Every stage and activity carries sources (`https`, publisher, title, accessed date, allowed licence). NHS, UNICEF and similar sites are link-only: they are shown as "Further reading", never as a source of our text, and may not be the first or only source of an item (the Room Repeater module item cites its own site). OGL-3.0 is not allowed. Texts describe what many children around an age tend to do and never assess a particular child. `reviewed.by` stays `null` on DEV; `validate-content.mjs --release` requires a name from `scripts/reviewers.json`.

Validator output is one line per violation, `<file> <id|-> C<n>: <message>`, with exit code 1. `--root <dir>` runs it against a copy of this folder.

## Release flow

1. Work on `feature/fb-<increment>-<slug>`, run `npm run check && npm run test:e2e`, merge into `dev` → DEV.
2. `scripts/promote.sh uat` (runs `validate-content.mjs --release` first), commit `uat/`, push `dev` → UAT.
3. PROD is served only from `korkovik/family-buddy` after Tom merges the uat → main pull request (architecture.md §5).

## Rollback

DEV/UAT: `git revert` the commit on `dev` and push. PROD: revert the merge commit on `main` in `korkovik/family-buddy`. User data lives on the devices, so a rollback never loses it; data from a newer schema is shown read-only and never overwritten.

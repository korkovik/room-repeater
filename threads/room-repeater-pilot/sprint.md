# Sprint — room-repeater-pilot — increment WA (2026-10-01)

**Increment:** "Words per lesson" setting (2–8, recommended, Random) + "animal families" (~40-animal roster that never runs out). DEV only (`dev/index.html`), legacy (`?backend=off`) and account (stub/Supabase) modes.

**Why this increment:** Tom asked for both directly (2026-10-01). Both are client-only changes to one file, no new personal data, no new backend surface — fits one working session.

## Scrum Master's framing (assumptions the BA may refine, not override without reason)
1. "Words per lesson" = number of **distinct objects (friends)** in one lesson, each practised in every active language. It is not "new words per lesson": rule 3 (max 2 new objects) stays, but never more new than the words setting allows. "Pictures per session" stays as the length of the lesson (number of turns); the words setting decides how many different things those pictures show.
2. Random = a number drawn per lesson from a sensible range; it must be deterministic for a given day + lesson number so the Today card preview and the actual session agree.
3. Animal families: next animal = roster animal with the fewest members so far (ties by roster order). Gifts keep storing the base animal id (string ≤ 32), member number is derived from order. Expected: no DB migration (gifts.animal only has a length check; settings jsonb ≤ 4096 B). Architect to confirm.
4. Keep every existing element ID and data-testid. Do not touch `uat/`, root `index.html`, `family-buddy/`.

## Tasks
| # | Task | Agent | Output |
|---|---|---|---|
| 1 | Spec both features with Gherkin ACs; settle open points in the brief | ba-product-owner | `threads/room-repeater-pilot/spec-wa.md` |
| 2 | Feasibility + data/sync check (settings shape, gift shape, merge/order, migration yes/no, emoji rendering on Android Chrome) | architect | `threads/room-repeater-pilot/architecture-wa.md` |
| 3 | Test plan (happy path + migration + sync) | qa-tester (phase 1) | `threads/room-repeater-pilot/testplan-wa.md` |
| 4 | Implement on `dev/index.html` | developer | code + `threads/room-repeater-pilot/dev-notes-wa.md` |
| 5 | Security review | security | `threads/room-repeater-pilot/security-wa.md` |
| 6 | Verify | qa-tester (phase 2) | `threads/room-repeater-pilot/qa-report-wa.md` |
| 7 | Commit dev/ + docs to `dev`, push, verify live /dev/ | scrum-master | commit hash |

**Skipped roles:** market-researcher, business-strategist, financial — no market/business/money question in this increment. legal — no new personal data, no AI feature, no payments; the in-app recommendation is a parenting tip, BA must cite sources and keep wording modest (no "proven" claims).

**Done when:** both features meet the spec ACs in legacy and account (stub) modes, security APPROVED (or MINOR only), QA PASSED, pushed to `dev`, live https://korkovik.github.io/room-repeater/dev/ serves the build. Loop cap: 3 dev↔security/QA loops.

## Result (2026-10-01)
- Tom's answers mid-sprint: recommendation min 3 (spec rev 2), Random 2–5 and the 12 accessories approved.
- Agents: ba-product-owner (spec) → architect (no migration, 6 SPEC CHANGE lines) → qa-tester phase 1 (92 scenarios) → developer (build) → ba-product-owner (spec rev 2) → developer (D-1..D-3) → security APPROVED, 4 MINOR → qa-tester phase 2 PASSED 91/92 (1 deferred to device UAT). Loops used: 1 of 3.

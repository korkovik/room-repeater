# Architecture check: increment WA (Words per lesson + Animal families)

Architect, 2026-10-01. Scope: a review of data shape and sync only. **No environment, hosting, CI or backend changes in WA.** `architecture.md` (environments, path to production) still applies as it is.

**Summary**
1. I reviewed `spec-wa.md` against `dev/index.html` (settings at l.1262–1269, validators at l.955–957, outbox at l.1290–1303, merge at l.1348–1362, the stub at l.992ff) and migrations 001/002.
2. Verdict: **FEASIBLE, no DB migration.** I made 6 decisions. Two are small SPEC CHANGEs: a one-line settings self-heal and a deterministic tie-break for member order. One is hardening: a malformed gift must not block the outbox.
3. Next: the developer applies the SPEC CHANGE lines below together with the spec. QA adds the 4 extra checks in §8.

---

## 1. Migration needed? **No.**

| Check | Source | Result |
|---|---|---|
| `gifts.animal` | 001: `text not null check (char_length(animal) between 1 and 32)`. No enum and no FK | Longest new id = `butterfly` / `hedgehog` / `kangaroo` (≤ 9 chars). Unknown future ids also pass. **OK** |
| `gifts` append-only | 001: INSERT/SELECT grants only, `rr_gifts_stamp` sets `created_at` | WA only appends one row per finished lesson, same shape `{id:uuid, child_id, day, animal}`. The member number is derived, never stored. **OK** |
| `children.settings` size | 001: `jsonb_typeof = 'object' and pg_column_size(settings) <= 4096`. Client `okSettings` uses `JSON.stringify(s).length <= 4096` | I measured it with node against the real `OBJECTS` (61 ids, longest 10 chars): `{en,de,es,pics:30,parent,off:[all 61],lessonWords:"random"}` = **558 chars** (558 bytes, ASCII only). The jsonb binary form adds about 4 B per array element plus headers, so roughly 0.8 KB, about **20 % of the limit** (estimate). `off` can only hold built-in ids (`cleanOff` filters by `BY_ID`), so this is the worst case. **OK** |
| `children` LWW trigger | `rr_children_before_write` replaces `settings` as a whole | No change. See Q2 for what that means for an older client |
| Stub backend | `saveSettings` stores `copy(s)` wholesale. `push` validates gifts with `okGift` (≤32) | Same behaviour as the DB. **No stub change needed** |

Decision: **no `003_` migration**. `supabase/migrations/` stays untouched, which matches the spec's must-not-change list.

## 2. Older client saves settings without `lessonWords`. **R-W8 plus a one-line self-heal.**

What actually happens (source: the code):
- An older build's `settingsObj()` has no `lessonWords`. It queues settings only when its own settings change (`sk !== A.lastSettings`, l.1301). When it does, the server row is replaced wholesale (trigger and stub `saveSettings`), so the key is gone from the server.
- New clients that pull this row keep their local value (R-W8: `applySettings` acts only when the key is present). A device that signs in fresh, or one that lost its working copy, gets `"rec"`. Devices then **diverge silently** until someone changes a setting on a new build.
- Where would an older client come from? There is **no service worker** in `dev/` (I checked: no `serviceWorker`/`caches`), so a stale build is either a tab or home-screen app left open since before the push, or GitHub Pages' ~10 min HTTP cache (my own knowledge). The more realistic case: once Tom pastes the rr-nonprod config, **DEV and UAT share one Supabase project** (`RR_BACKENDS.dev` = `.uat`). The UAT build (pre-WA) then stays an older client for the same test account until WA is promoted.

Decision: no server-side merge. It would need a trigger change (a migration) plus a stub change, which is out of scope. Instead, add a **client self-heal, one line in `merge()`**:

> SPEC CHANGE (R-W8, add): "When a pulled settings object is applied and it has **no** `lessonWords` key while the local `lessonWordsMode()` is not `"rec"`, do not set `A.lastSettings` to the new `settingsObj()`. Set it to `''` instead. The next `save()` (every `render()` → `buildPlan()` → `save()`) then queues the merged settings (the server's values plus the local `lessonWords`) with a fresh `at`, which puts the key back on the server. If the local mode is `"rec"`, do nothing (a missing key already means `"rec"`)."

> SPEC CHANGE (AC-13, extend): "…then the local value stays 5, **and after the next sync the server settings contain `lessonWords: 5`**."

Known, accepted race (DEV/UAT test data only): if the old client writes again within the seconds between this pull and the re-push, the re-push wins by LWW and that one old-client edit is lost. Ping-pong can't happen, because the old client never pushes unless its own settings change.

Legacy (`?backend=off`): a stored `settings` without the key loads via `Object.assign(S, …)` (l.599). `lessonWordsMode()` then returns `"rec"`. Nothing else is needed. **Do not bump `S.v`.** The `S.v!==2` block must stay as it is.

## 3. Member order across devices. **Tie-break by gift id. No `created_at`. Don't touch `merge()`.**

Why (day, index) is not enough: `S.earned` order is local arrival order. Own gifts are pushed in `found()`, pulled gifts are appended in `merge()` (l.1351), and `merge()` then sorts by day only (stable). Two phones that each earn a same-day gift of the same family keep them in **opposite** orders, and a freshly signed-in phone gets server `created_at` order. That gives three possible numberings.

Why not `created_at`: the client never has it for its **own** gifts. They are created locally, and `A.seenG` skips them on pull, so the server stamp never reaches the device that made them. A tie-break on it can't be deterministic without changing merge/pull.

Decision: one comparator, used **only for display and numbering** (on a copy). `S.earned` and `merge()` stay unchanged:

```
giftCmp(a,b) = (day ascending, missing/invalid day first)
             → then String(a.id) vs String(b.id) (plain < / > compare)
             → then original index in S.earned
```

- Account mode: `id` is the gift uuid. It is random for gifts made in-app and `uuidFromHash` for imported ones, and it is identical on every device, so numbering is **identical everywhere** once synced.
- Legacy mode: `id` is the animal id, which is equal within a family, so this falls through to index. That is exactly the spec's current rule, and legacy has only one device anyway.
- `found()` must compute k for `partyText`/`partyArt` with the same comparator *after* the push, so the party and the Zoo agree.
- Accepted cosmetic case: two offline phones each celebrate "A second rabbit". After sync one of them becomes #3, the same on both phones. No rule can avoid this without coordination.

> SPEC CHANGE (R-A2 "Member order"): replace "ties by index in `S.earned`" with "ties by `String(id)` ascending, then by index in `S.earned`". The same order applies to the "newest 4 known gifts" in R-A6 `friendRow`.
> SPEC CHANGE (Assumption 7): "Member numbering is deterministic across devices after sync. Only a number shown in a celebration can shift (e.g. #2 → #3) when two devices earned the same family offline on the same day."

## 4. Emoji rendering on Android Chrome. **Minimum Android 10. All 40 + 12 accessories render. No fallback code.**

- **Assumption: Android 10+.** Chrome 139 (released August 2025) and later require Android 10. Chrome 138 was the last version for Android 8/9 ([Android Authority](https://www.androidauthority.com/chrome-dropping-support-android-8-9-3571442/), [Android Central](https://www.androidcentral.com/phones/some-older-android-phones-will-no-longer-get-chrome-updates)). Chrome draws web text with the **system** emoji font (my own knowledge), so the OS version decides.
- Android 10 (released 2019-09-03) has full **Emoji 12.0** support ([Emojipedia: Android 10.0](https://emojipedia.org/google/android-10.0)).
- 🦩 Flamingo: Unicode 12.0 / Emoji 12.0, 2019 ([Emojipedia](https://emojipedia.org/flamingo)). It is **already in the live 12-animal roster** (DEV, UAT and PROD), so it carries no new risk.
- 🦥 Sloth: Unicode 12.0 / Emoji 12.0, 2019 ([Emojipedia](https://emojipedia.org/sloth)). Same level as the flamingo.
- 🐿️ U+1F43F + U+FE0F: Unicode 7.0 (2014) / Emoji 1.0 (2015) ([Emojipedia](https://emojipedia.org/chipmunk)). VS16 forces emoji presentation. Keep the `FE0F` literally in the source string. Note: the Unicode name is **CHIPMUNK**. Showing it as "squirrel / Eichhörnchen / ardilla" is fine for a toddler and needs no change.
- Everything else in the roster and `ACC` is Emoji ≤ 11.0 (hippo, kangaroo, parrot are Emoji 11 / 2018. 🧢 🧣 and giraffe, hedgehog, zebra are Emoji 5.0 / 2017. 🕶️ is Unicode 7.0 + VS16). All of these are below Android 10's level. Source: the spec table plus my own knowledge. I checked only the three flagged emoji against Emojipedia.
- Samsung Internet / One UI 2 (Android 10) also covers Emoji 12 (my own knowledge, not verified). Not a target anyway.
- **Silhouette:** `.shadow{filter:var(--silhouette)}` (l.178) blackens everything inside it, children included. Today the reveal (`reveal()`, l.857) and the Zoo next tile (l.~898) put only `a.e` inside `.shadow`. Decision: the member helper (`.mem`/`.acc`/`.num`) must **never** be rendered inside `.shadow`. Both silhouettes use `nextAnimal().e` only (R-A5 already says so).
- Overlay CSS: `.mem{position:relative;display:inline-block;line-height:1}`, `.acc{position:absolute;top:-.1em;right:-.25em;font-size:45%}`. These don't change tile size, so no layout shift (estimate, QA verifies on a 360 px viewport).

> SPEC CHANGE (Roster note under the table): "🦩 and 🦥 need Emoji 12 = Android 10+, which is also the minimum for current Chrome (139+). 🐿️ must be stored as U+1F43F U+FE0F."

## 5. `dinnerWords()` with the limited plan. **Accept the limited plan.**

`dinnerWords()` (l.670) takes today's missed turns, then today's said turns, and only then fills from `buildPlan()`, capped at 4 pairs. Once a lesson has been played, the plan is just a filler. Before the first lesson, the limited plan gives N objects × L languages (≥ 2 × 1 = 2 pairs, usually ≥ 4). That focuses the dinner tips on the same few words as the lesson, which matches the point of the feature. No objection, and no separate unlimited plan.

Condition for the developer: the word target (rec / fixed / random draw) must be a **pure function of state** (no writes). `buildPlan()` runs 2–3× per `render()` (render, dinnerWords, and startSession), and every call must pick the same N objects. The existing rule-4 side effect (`S.dropped.push` + `save()`) stays as it is.

## 6. Random seed k. **Count all gifts with `day === today()`, synced ones included.**

- Gifts have no device marker, so "local only" can't be computed without a new field. That would be a shape change, which is out of scope.
- Counting synced gifts makes two phones show the same draw for the same lesson once synced. Pulls never apply mid-session (`inSession()`), so the session can't change under the child.
- Count **every** `S.earned` entry with `day === today()`, including unknown ids (for example `unicorn`). Skip only entries without a valid `day`. This gives the same k on every device that has the same rows.
- `today()` is the **UTC** date (`toISOString().slice(0,10)`, l.605), so the draw and k reset at 02:00 Prague time in summer (01:00 in winter). That is the existing day semantics for the whole app. Keep it. QA's test vectors are UTC dates.
- I checked the FNV-1a vectors in node (UTF-8, offset 0x811c9dc5, prime 0x01000193, `Math.imul`, `>>>0`): `2026-10-01|0`→3, `|1`→4, `|2`→5, `2026-10-02|0`→2. **All four match the spec.**

## 7. Other conflicts with sync, validation, legacy or UAT/PROD

1. **A malformed gift blocks the outbox (account mode). This bug already exists, but WA's edge-case table makes it visible.** `acctSave()` (l.1295) converts any entry without `animal` (`g.animal=g.id; g.id=uuid()`) and queues it. An entry `{}` or one without `day` would be queued with `animal:undefined`. `push` rejects the **whole** call (stub l.1058, PostgREST the same), so turns and gifts stop syncing.
   > SPEC CHANGE (Edge cases animals, `{}`/missing day row): "Legacy: kept and ignored for display. Account: kept locally, ignored for display, **not queued**. `acctSave()` skips entries that fail `okGift()` (one guard before the legacy→account conversion)."
   R-A2's phrase "synced as before" then applies only to valid rows with unknown ids (`unicorn`). Those pass `okGift`, are already in `A.seenG` after a pull, and are never re-queued. That is correct as it stands.
2. **Older UAT build on the shared rr-nonprod backend** (only once Tom configures it). The pre-WA `renderZoo()` counts every distinct `aid`, unknown ones included (l.894). An account with new-roster gifts (cat, dog…) then shows "13 of 12" / "All 12!" in UAT. This is cosmetic, uses test data only, and goes away when WA is promoted. **Don't touch `uat/`.** QA should know about it. It is not a Tom decision.
3. **Storage keys and isolation: OK.** DEV uses `rr-pilot-v1-dev`, `rr-acct-dev`, `rr-outbox-dev`, `rr-sync-dev`, `rr-import-dev`, `rr-stub-db-dev`. UAT/PROD use their own keys (PROD `rr-pilot-v1`) on the same origin `korkovik.github.io`. WA adds **no new storage key**, and none of its writes can reach UAT or PROD data.
4. **Rollback is safe.** If DEV is reverted to the pre-WA build, it ignores `lessonWords` (`applySettings` whitelists keys), and its `ANIMALS[n%12]` still works. Only the old zoo counter would be off, as in item 2.
5. **`enterApp()` (l.1273) loads `w.settings` with `Object.assign` and no validation.** That is fine as long as every reader goes through `lessonWordsMode()` (R-W1 already requires this). `applySettings()` must store the *validated* value (`"rec"` for garbage), never the raw one.
6. **No spurious settings push on upgrade.** `enterApp()` sets `A.lastSettings` from the new `settingsObj()` (which already contains `lessonWords`), so the first new-build open does not queue settings. Settings are queued only on a real change, or on the Q2 self-heal.
7. **createChild defaults (l.1218 submit handler).** Adding `lessonWords:"rec"` passes `okSettings` (stub and DB) without trouble.
8. **Pilot import.** `doImport` → `applySettings({...p.settings, off:null})` carries `lessonWords` through the validation. Imported gifts get `uuidFromHash` ids, so the Q3 tie-break is deterministic for them too. OK.
9. **`#planMeta` test id.** Today the code sets `data-testid="plan-empty"` or deletes it (l.711). Setting `plan-meta` in the else branch replaces that `delete`, and no existing test id is lost. OK.

## 8. Extra checks for QA (feed to `testplan-wa.md`)

- **X-1 (Q2 self-heal):** stub, phone A at fixed 5. Write server settings without `lessonWords` (an older build, or edit `rr-stub-db-dev` directly). Then A pulls → A still shows 5 → after the next flush the stub row has `lessonWords:5`. Repeat with A on `"rec"`: no extra settings push.
- **X-2 (Q3 order):** stub, phones A and B both offline. Each earns the same family on the same day. Sync both. Then `zoo-family` shows the same member numbers on A, B and a third freshly signed-in phone C.
- **X-3 (§7.1):** account mode with `{}` injected into `rr-acct-dev` `earned`. Finish a lesson, and the outbox drains to 0 (turns and gift reach the stub).
- **X-4 (Q4):** Android 10+ Chrome (or an emulator with an API 29 image): roster tiles 11 (🦩), 23 (🐿️) and 32 (🦥), the 12 accessories, and no tofu boxes. The reveal silhouette is solid black with no accessory.

## 9. Cost & limits

There is no new cost. Settings grow by ≤ 20 B per child (558 B worst case vs the 4096 B limit), and gifts by one row per finished lesson, as today. Supabase free tier is not affected.

No handback entries: nothing in WA needs Tom's money, secrets, hosting or a public deploy. The only optional taste check (the accessory set) is already in `spec-wa.md` "Open for Tom".

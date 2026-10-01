# Security review: room-repeater-pilot, increment WA (2026-10-01)

**Did:** reviewed the uncommitted `git diff -- dev/index.html` (+190/−53 lines), covering "Words per lesson" (`lessonWords`) and "Animal families" (40-animal roster, 12 accessories, `members()`, the QA hooks). I ran a syntax check and a hostile-input unit test of the new pure functions.
**Verdict:** APPROVED with 4 MINOR suggestions. There are no BLOCKER or MAJOR findings.
**Next:** QA phase 2 (`testplan-wa.md`). The MINOR items can go in the next increment and do not block UAT.

Reviewer: security agent. Scope: `dev/index.html` only. Context read: `spec-wa.md`, `architecture-wa.md`, `dev-notes-wa.md`, `supabase/migrations/001_i1_accounts.sql` (gifts/settings constraints).

## Checks run (results)

| Check | Result |
|---|---|
| `git status` | Only `dev/index.html` is modified. `threads/` is untracked. `git diff --quiet -- uat index.html family-buddy supabase promote.sh` gives no changes (**untouched: OK**). |
| `node --check` on the extracted inline script (1,191 lines, single `<script>`) | **SYNTAX OK** |
| Diff grep for `http`, `fetch`, `src=`, `<script`, `eval`, `localStorage`, `console.` in added lines | **0 hits.** No new network calls, external scripts, storage keys or debug output. |
| Hostile-input node test of `normLessonWords`, `members`, `nextAnimal`, `familyCounts`, `memHTML` (copied verbatim from the diff) | All pass. See below. |
| `npm audit` / `pip-audit` | Not applicable. room-repeater has no `package.json` and the diff adds no dependencies. `family-buddy/` is unchanged. |
| Typecheck / lint / test suite | The project has none. The developer reports Playwright 76/76 (`?backend=off`) and 26/26 (`?backend=stub`) in `dev-notes-wa.md`. I did not re-run these. |

Hostile-input results (my own run, scratchpad `t.js`):
- `normLessonWords`: `undefined`, `null`, `true`, `''`, `' '`, `'RANDOM'`, `[5]`, `{}`, `'abc'`, `NaN`, `Infinity` and an object with `valueOf` all give `'rec'`. `1` → 2, `99` → 8, `-3` → 2, `'1e308'` → 8, `' 7 '` → 7, `'0x5'` → 5. The output is always `'rec'`, `'random'` or an integer from 2 to 8.
- `members()` on `[null, {}, {id:'cat'}, {id:'unicorn',day}, {id:'cat',day}, {animal:'__proto__',…}, {animal:'constructor',…}, {id:'cat',day:'<img>'}, {id:{toString(){return 'cat'}},day}, 'str', 5]` returns only `cat#1`. It does not throw. `__proto__`/`constructor` ids are rejected because `ANIMAL_IDX` is a `Map`.
- 100,000 rabbit gifts: `members()` takes 25 ms. Member numbers render as plain integers. The accessory index is `(k-2)%12`, and `ORDINAL` is only read for k ≤ 10, so no index goes out of range.
- `Object.assign({}, JSON.parse('{"__proto__":{"lessonWords":"<x>"}}'))` only changes the local object's prototype, and `Object.prototype` stays clean. The inherited value is still normalised to `'rec'`.

## Findings by area

**1. Secrets and credentials (OWASP A02/A07):** none were added. `RR_BACKENDS` is untouched.

**2. Injection / XSS (OWASP A03 Injection; ASVS V5 output encoding):** this area is clean. Every new or changed `innerHTML` sink is listed below.
- `memHTML()` (l.~970): `esc(a.e)` and `esc(ACC[…])`. `k` is a computed integer.
- `reveal()` `card.innerHTML`: changed from raw `a.e` to `esc(a.e)`, which is an improvement.
- `found()` `partyArt` (was `textContent`, now `innerHTML` via `memHTML`) and `partyShelf` (the `+hidden` count is an integer). The `partyText` sentence still uses `textContent`.
- `renderAnimals()` `friendRow`: built only from `memHTML`.
- `renderZoo()`: `aria-label="${esc(a.en)}"` and `data-count` (integer). `data-animal="${a.id}"`/`${coming.id}` are not escaped, but they come from the constant `ANIMALS` roster and never from data. See MINOR-3.
- The `zooGrid` click handler now uses `esc(a[l])`, where the old code was raw. The animal is found by `ANIMALS.find(x=>x.id===t.dataset.animal)`, so a tampered DOM attribute cannot inject a name.
- The words-setting text (`optWordsHint`, `optWordsNote`, `planMeta`) all uses `textContent`. Own-word text paths are unchanged and still use `esc()`.

**3. AuthZ / data exposure / sync integrity (OWASP A01, A04, A08):**
- `lessonWords` is normalised on every read (`lessonWordsMode()`), on every write (`setWords`) and on pull (`applySettings`, l.1400). `settingsObj()` only ever emits the normalised value, so the server row grows by about 22 bytes at most, far below the 4096 B `okSettings` / `pg_column_size` limit. Children's data does not leave the existing Supabase path, and there is no new endpoint.
- Self-heal (`merge`, l.1490–1493): a server row without `lessonWords` re-queues settings only when the local mode is not `'rec'`. Through `hasOwnProperty` it is a one-shot write with a fresh timestamp. Older builds don't re-push an unknown key, so there is no ping-pong loop.
- Gifts: `acctSave` now skips `!okGift(g)` before mutating or queuing, so `{}`/`null`/day-less entries no longer reach the outbox. That is an improvement: before, `{}` became `{animal:undefined,id:uuid}` and the server rejected it, which blocked the whole push. Each gift is queued at most once (`A.seenG`), so the outbox cannot grow without bound. Unknown but well-formed ids (e.g. a future animal) are still pushed and stay within the DB check `char_length(animal) between 1 and 32`. They are hidden from display (`members()`), which matches architecture-wa §7.1. One residual edge case is listed under MINOR-2.
- RLS and migrations: no migration in WA. Policies `gifts_insert_own`/`gifts_select_own` are unchanged.

**4. Dependencies:** none were added.

**5. Transport and storage:** no new storage key (`architecture-wa.md` §7.3 confirms the same). No sensitive data goes into localStorage beyond what was already there.

**6. Correctness that affects safety:**
- `buildQueue` loop termination: `groups` is non-empty and each group has at least 1 pair, so `q.length` increases on every inner iteration. It is bounded by `pics()` (6–30) plus one round. OK.
- `wordsRec()` with zero languages would divide by 0 and give `Infinity`, which clamps to 4. In any case `langs()` is forced to at least 1 elsewhere. OK.
- `retryMissed()` adds a `gone()` check before mutating the queue. OK.

**7. QA hooks `window.RR_LESSON` / `window.RR_ANIMALS`:** they expose nothing sensitive (constant roster copies, counts, the computed queue as `{obj,lang}`). They follow the existing `RR_WORDS` pattern. `roster()`/`next()` return shallow copies, and `counts()` returns a fresh object, so the hooks cannot mutate `ANIMALS` or `S`. One caveat is MINOR-1.

## Verdict

```
VERDICT: APPROVED

I checked the following. git status shows only dev/index.html changed, and uat/, root index.html, family-buddy/,
supabase/ and promote.sh are confirmed untouched. node --check passed on the inline script. A grep of the added lines
found no new network calls, external scripts, storage keys or console output. I reviewed every new or changed
innerHTML template: all data-derived text goes through esc() or textContent, and two existing raw sinks (reveal shadow,
zoo names) were fixed. The new synced setting lessonWords is normalised on read, write and pull to 'rec' | 'random' | 2..8
(fuzzed with 22 hostile values). Gift handling: malformed entries are skipped before mutation, each gift is queued
at most once, and members() ignores unknown ids, __proto__ and non-string ids. Prototype pollution: Map lookups, and
Object.prototype stays clean. DoS: 100k gifts give members() in 25 ms, with bounded array indices. The QA hooks return
copies only. No npm/pip audit applies because no dependencies were added.

Non-blocking suggestions (MINOR):
1. [MINOR] dev/index.html:1036–1037 — The comment calls RR_LESSON.queue() "read-only", but it calls buildPlan(), which
   can append to S.dropped and call save() (rule 4). That is the same side effect render() already has, so it is
   harmless, but the label is inaccurate, and the hooks will ship to PROD via promote.sh. Fix: reword the comment to
   "same side effects as render()". Optionally define RR_LESSON/RR_ANIMALS only when ENV!=='prod' (also for RR_WORDS)
   to keep the global surface small in PROD.
2. [MINOR] dev/index.html:1428 (acctSave) — okGift() does not check that g.id is a UUID when g.animal is set. A
   tampered working copy {id:'x',animal:'cat',day} would still be queued, and the server would reject the whole
   turns/gifts/dropped batch on every flush (sync stalls; same-origin tamper only, pre-existing). Fix: in acctSave,
   also skip g.animal && !UUID_RE.test(g.id), or regenerate g.id=uuid() in that case.
3. [MINOR] dev/index.html:1022 — data-animal="${a.id}" and "${coming.id}" are interpolated without esc(). They are
   safe today because the ids are constants, but they are inconsistent with the "everything through esc()" rule.
   Fix: wrap both in esc().
4. [MINOR, pre-existing, not introduced by WA] dev/index.html:1411 (enterApp: S.earned.filter(g=>g.animal)) and the
   merge sort at ~l.1495 (a.day on null) throw on a null entry in the stored earned[]. members() and acctSave now
   tolerate null, but these two paths do not. Fix: in enterApp, filter S.earned with g&&typeof g==='object' after
   loading the working copy.
```

No handback entries: nothing in this increment needs a secret, an account, hosting or Tom's money.

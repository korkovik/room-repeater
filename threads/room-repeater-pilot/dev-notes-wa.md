# Dev notes: increment WA ("Words per lesson" + "Animal families")

Developer, 2026-10-01.

1. **What I did:** I implemented spec-wa R-W1…R-W8 and R-A1…R-A8 in `dev/index.html` and applied every SPEC CHANGE from `architecture-wa.md`. The file has +188 / −53 lines, sha256 prefix `681a82765da0cff0`. No other file in the repo changed. I did not commit.
2. **Result:** I ran headless Playwright against `?backend=off` (76/76 checks pass) and `?backend=stub` (26/26 pass). There are no page or console errors. Every baseline id and data-testid is still present. The protected files match QA's baseline hashes.
3. **Next:** security review, then QA phase 2 (`testplan-wa.md`). I resolved QA's SD-1…SD-3 as assumptions (see §4). The BA should confirm SD-1.

---

## 1. What changed (`dev/index.html` only)

### Words per lesson
| Piece | Change |
|---|---|
| `normLessonWords(v)` / `lessonWordsMode()` | R-W1 validation: `'rec'`/`'random'` pass through. A number, or a non-empty numeric string, is rounded and clamped to 2–8. Everything else (`null`, `''`, booleans, `"abc"`) becomes `'rec'`. Every reader goes through the accessor. |
| `wordsRec()` | `clamp(floor(pics()/max(L,2)),2,4)` |
| `fnv1a32(s)`, `lessonIndex()`, `randomWords()` | FNV-1a 32 over UTF-8 (`TextEncoder`, `Math.imul`, `>>>0`). k counts every `S.earned` entry with `day === today()`, including unknown ids (arch §6). |
| `wordsTarget()` | T = fixed value, rec, or the random draw. It is pure: it reads state and writes nothing (arch §5). |
| `buildPlan()` | Rule 4 (drop) and its `save()` are unchanged. It then picks N = min(T, pics, eligible) objects in this order: misses → stale (both capped at N−1 while a new object exists) → new (at most min(2,N)) → review (most recent `last` oldest first, so objects heard today come last) → any eligible object. It returns pairs ordered by slot, then by need inside each object (miss, new, stale, review oldest first, heard today), then en/de/es. Each pair has `why`. |
| `buildQueue(plan)` | Round-robin over the objects in slot order. Object i contributes `langs_i[r % len_i]` per round, and rounds repeat until the queue has `pics()` items. Items from round r ≥ len_i get `why:'review'`. |
| `retryMissed()` + `P0`/`played` | R-W5. `startSession()` records P0 = the pairs in `queue.slice(0,cap)`. `next()` records played pairs. A retry is accepted only if every unplayed P0 pair is still inside `tentative.slice(0, cap-turnNo)`. |
| `render()` | `planMeta` shows "{N} word(s){ (random)} · P pictures · ~Z min", where N = distinct objects. It sets `data-testid="plan-meta"` in the non-empty branch, and `plan-empty` keeps priority. It then calls `renderWordsSetting(N)`. |
| `renderWordsSetting(nW)` | Fills the stepper value, disables input and buttons in Random, sets the switch, the hint text, `wordsRec` visibility and the fit note (R-W7). |
| Handlers | −/+ step from the shown value and set a fixed 2–8 (no-op in Random). Typing clamps to 2–8, and an empty or non-number entry means `'rec'`. Use recommended sets `'rec'`. The switch sets `'random'` / `'rec'`. Every change runs `save(); render();`. |
| Settings plumbing | `S` default, `resetS()` and the createChild defaults now include `lessonWords:'rec'`. `settingsObj()` adds `lessonWords: lessonWordsMode()`. `applySettings()` stores the validated value only when the key is present. `wipeDom()` clears `optWordsHint` and `optWordsNote`. |

### Animal families
| Piece | Change |
|---|---|
| `ANIMALS` | 40 rows exactly as in the spec table. I checked them by script against `spec-wa.md` (ids, emoji code points, en/de/es): 0 mismatches. 🐿️ is written as `'\u{1F43F}️'`. |
| `ACC` | The 12 accessories confirmed by the coordinator. 🕶️ is written as `'\u{1F576}️'`. |
| `members()` | Known gifts in member order, computed on a copy, with k (the 1-based member number) attached. |
| `familyCounts()`, `nextAnimal()` | Family with the fewest members wins; ties go to the lowest roster index. |
| `memHTML(a,k,num)` | R-A8 markup: `.mem[data-member]` + `.acc` (k ≥ 2) + `.num` (k ≥ 2, only where `num` is true, i.e. the zoo-family strip). Emoji go through `esc()`. |
| `reveal()` | Silhouette of `nextAnimal().e`, base emoji only, escaped. |
| `found()` | Pushes the base id in both shapes (unchanged). It computes k with `members()` after the push, then renders `partyArt` as member markup and `partyText` as "is here!" / "A {ordinal} … family!" / "number k". `partyShelf` shows this family, the last 8 members with a "+hidden" prefix, and the new one in `span.new`. The strings "is here again!" and "that's all 12!" are gone (grep count 0). |
| `renderAnimals()` | The pill reads "{F} friend(s)". `animalsMeta` reads "{M} famil(y/ies) · someone new comes after the next session." `friendRow` shows the newest 4 members, then `?`, then empty slots up to 5. |
| `renderZoo()` + click handler | Order: earned tiles (`data-count`, member 1, `×k`), one `next` tile (base silhouette), then eggs. Tapping a family tile shows the names line (now escaped) plus `<div class="family" data-testid="zoo-family">` with numbered members. |
| CSS | `.mem`, `.mem .acc` (top-right, 45 %), `.mem .num` badge, `.family` strip, `button.linkbtn.mini`, `.wnote`. |

### New ids / data-testids / hooks
- Ids: `wordsMinus`, `optWords`, `wordsPlus`, `optWordsHint`, `wordsRec`, `optWordsRandom`, `optWordsNote`.
- Testids: `words-minus`, `words-per-lesson`, `words-plus`, `words-hint`, `words-rec`, `words-random`, `words-note`, `zoo-family`, and runtime `plan-meta`.
- Attributes: `data-count` on earned tiles, `data-member` on `.mem`.
- QA hooks (read-only): `window.RR_LESSON = {mode(), target(), rec(), n(), queue()}`, where `queue()` = `buildQueue(buildPlan()).slice(0,pics())` as `[{obj,lang}]`. `window.RR_ANIMALS = {roster(), next(), counts()}`, all copies.
- Markup: Settings "Session" group order is Words per lesson → Random each lesson → Pictures per session → I'll confirm each word. `#optWordsNote` sits below the group. `#animalsCount` static text changed from "0 / 12" to "0 friends" (the id is kept).

## 2. How each SPEC CHANGE was applied

| SPEC CHANGE (architecture-wa) | Applied |
|---|---|
| §2 R-W8 self-heal | In `merge()`, after `applySettings()`: if the pulled settings have no own `lessonWords` key and local `lessonWordsMode() !== 'rec'`, then `A.lastSettings = ''`. Otherwise it is the new `settingsObj()` as before. The `render()` → `buildPlan()` → `save()` that follows queues the merged settings with a fresh `at`. Verified in stub (AC-13 + X-1, below). |
| §2 AC-13 extend | Verified: after the next sync the server row has `lessonWords: 5` again. In `'rec'` mode, no settings push happens. |
| §3 member order | One comparator, in `members()` only: day ascending → `String(id)` → index in `S.earned`. `merge()` and `S.earned` order are untouched. For legacy entries (no `animal` field) the id tie key is `''`, so they fall through to the index. That is the architect's stated intent ("legacy falls through to index") and avoids sorting same-day legacy gifts of *different* families alphabetically in `friendRow`. `found()` computes k with the same function after the push. |
| §4 emoji / silhouette | 🐿️ and 🕶️ are stored with FE0F (checked: code points `1f43f fe0f`). `.shadow` only ever contains `esc(a.e)`, both in `reveal()` and in the zoo next tile. No member markup goes inside it. |
| §5 pure target | `wordsTarget()` and everything it calls are read-only. Preview, dinner and session use the same function on the same state. Tests check preview == played order for fixed, rec and random. |
| §7.1 malformed gifts | `acctSave()` skips entries failing `okGift()` before the legacy→account conversion. They stay local and are not queued. Verified X-3: the outbox drains to 0 with `{}` and `{animal:'duck'}` (no day) in `earned`. |
| §7.1 display | Entries with no roster id **or no valid day** are not shown or counted (see SD-2 below). |

## 3. Verification (actual runs, 2026-10-01)

Setup:
- `python3 -m http.server 8765` from the repo root (stopped afterwards).
- Playwright 1.56.1 + Chromium headless shell installed in the scratchpad (`family-buddy/node_modules` was not installed, so I didn't touch it).
- Clock: `page.clock.install(2026-10-01T09:00Z)`. Speech stubbed as in testplan §0.
- Scripts (scratchpad, not repo): `pw/lib.js`, `pw/legacy.js`, `pw/stub.js`.

**`?backend=off`: 76 passed, 0 failed.** It covers:
- **Defaults:** AC-1 (2, rec hint, switch off, Use recommended hidden). Row order. Rec table 8/3→2, 9/3→3, 12/3→4, 8/2→4, 8/1→4, 6/3→2.
- **Validation:** AC-11 corrupt values (`"abc"`, 99, 1, 3.6, null, "random", "rec", "", true) → rec, 8, 2, 4, rec, random, rec, rec, rec.
- **FNV vectors** through `RR_LESSON.target()`: `2026-10-01|0,1,2` → 3, 4, 5 and `2026-10-02|0` → 2.
- **Fixed 4 at 12 pictures:** AC-2 title, meta and the exact queue from QA #13. "+ 1 more". AC-3: the played sequence equals the preview.
- **Fit note and small pools:** AC-8 note, "6 friends, 1 language", meta. The language fit note. AC-7 "1 friend" / "1 word" (legacy, everything but dog dropped).
- **Retry rule:** AC-4 (fixed 8/8 pictures, first missed → all 8 objects, 8 turns). The retry still happens when there is room (QA #32 exact sequence).
- **Plan order:** AC-6 reservation (exact queue). AC-5 with H8 (book, spoon, dog, cat, ball).
- **Random:** AC-9 "3 words (random)", session = preview, then "4 words (random)" and the next preview cup, banana, cat, ball. Random UI disabled state.
- **Typing and buttons:** uncheck Random → rec. Typed 5/0/9/3.6/'' → 5, 2, 8, 4, rec. AC-10 Use recommended. Bounds 8 and 2.
- **Today card = queue:** title, meta and queue length match `RR_LESSON.queue()` for 5 configurations (2/8/3 langs, 3/9/2, 5/7/1, rec/30/3, 8/10/de+es).
- **Animals G13:** next = cat. AC-19 "13 friends", "12 families · …", zooMeta. friendRow 🐙 🦩 🐪 🐇+🎀 ?. AC-20 grid (rabbit `data-count=2` "×2", 12 earned, next = cat 🐈, 27 eggs, 40 tiles). AC-21 strip markup and spoken names. Rabbit (×2) and duck tiles are the same size. AC-15 played: reveal 🐈, "Cat is here!", stored `{id:'cat',day}`.
- **Later members:** AC-16 (G41) reveal 🦆 without accessory, art 🦆+🎀, "A second duck joined the duck family!", shelf 2 members with the new one highlighted. AC-17 "Cat number 11 joined the cat family!", 👓, shelf "+3" plus 8 members.
- **AC-18:** 100 lessons through `next()` with a reload per step: 40 families, 20×3 + 20×2, next = mouse, consecutive gifts all differ, "100 friends · 40 families · …".
- **Edge cases:** unknown and malformed entries are ignored for counts and kept in storage (17 entries). Empty history gives "0 friends" and a grid of next = rabbit + 39 eggs. Roster has 40 entries and the squirrel code points are right.
- No pageerror or console.error, and `#asrNote` never shows "Error:".

**`?backend=stub`: 26 passed, 0 failed.** It covers:
- The new child is stored with `lessonWords:"rec"`.
- AC-12: A sets 5 → server 5 → phone B shows 5 / target 5. B turns Random on → A pulls → Random, "(random)", no lastErr.
- AC-13 / X-1: the server row is rewritten without the key and with pics 10. A pulls: pics 10, mode stays 5, settings re-queued, and the server has `lessonWords:5` again after sync. In rec mode: outbox 0 and no push.
- AC-22: gift row keys `{animal, child_id, day, id(uuid)}` + `created_at`, animal `rabbit`. B shows `{rabbit:1}`, "1 friend".
- AC-23: `unicorn` from the server is not counted, stays in `rr-acct-dev`, and the flush is clean.
- X-3: `{}` and an undated gift in `earned` → the next lesson is duck, the outbox drains to 0, and the server gifts are rabbit, duck, unicorn.
- AC-14: all 61 built-ins off + Random saves fine. Measured 557 bytes (the architect estimated 558). The empty pool shows `plan-empty`.
- Sign-out clears `optWordsHint` / `optWordsNote`.
- AC-24: import of 13 legacy gifts + 24 turns + `lessonWords:6` → "Imported: 24 turns, 13 animals.", "13 friends", "12 families", next cat, mode 6, zooMeta, server `lessonWords:6`.

**Static checks:**
- `node --check` on the extracted script: OK.
- Every baseline id and data-testid (QA baseline copy) is still present.
- `grep -c "is here again\|that's all"` = 0.
- Protected files are unchanged against QA's baseline: `index.html` a78010d861a3920a, `uat/index.html` 4c355937f568ba8d, combined `family-buddy/ supabase/migrations/ uat/` 427024bc309ac481.
- A 360 px screenshot of Settings and the zoo-family strip shows no horizontal overflow (scrollWidth 360).

**Bug found and fixed during verification:** a pull switched the mode to Random while the words input still had focus. Chrome then fired `change` on the disabled input as it lost focus, and the handler turned the shown draw into a fixed number (which it then pushed). The `optWords` change handler now ignores events in Random or when disabled.

## 4. Assumptions / decisions (QA spec defects)

- **SD-1 (BA please confirm):** I followed R-W2 literally. Step 5 fills up to N with any eligible object, so a fresh child on fixed 5 gets 5 objects, of which only 2 come from step 3 "new" and 3 come from step 5 (also unheard). Why: the spec says "so that N is always reached", AC-5 says "the rest come from review/eligible order", and a parent who picks 5 should see 5. At the default (rec = 2) both readings behave the same. Switching to the strict reading is a one-line change (drop `take(objs,N)` and cap step 5 to heard objects).
- **SD-2:** a gift with no valid `day` is **ignored for display and counts**. This follows the architect's SPEC CHANGE for §7.1 ("kept locally, ignored for display, not queued") rather than R-A2's "missing day sorts first". Such a gift could never sync, so counting it would make devices disagree.
- **SD-3:** an empty or non-numeric typed value means `'rec'`. That is handled in the input handler before validation.
- The `.num` badge sits bottom-left of the member, so it doesn't collide with the top-right accessory.

## 5. Known limitations

- After an offline same-day, same-family double gift, the number in the celebration can shift after sync (#2 → #3). This is accepted in architecture §3.
- There is no browser check on a real Android 10 device / API 29 emulator (X-4). That needs a device; the headless Chromium run on macOS shows all 40 animals + 12 accessories.
- Only `?backend=stub` was exercised. The Supabase adapter path is unchanged code, but no real backend is configured (RR_BACKENDS empty).
- The older UAT build on a shared backend would show "13 of 12" for new-roster gifts (arch §7.2). This is cosmetic and goes away when WA is promoted. I did not touch `uat/`.
- No handback entries: nothing here needs Tom's money, secrets, hosting or a deploy. The accessory set is already the optional taste check in the spec.

---

## Follow-up 2026-10-01 (Tom's answers, spec-wa change log)

1. **What I did:** applied D-1…D-3 from the spec-wa change log in `dev/index.html` only (+12 / −10 lines; sha256 prefix `681a82765da0cff0` → `e51af25c61e9e51c`). Not committed.
2. **Result:** `?backend=off` 93/93 pass, `?backend=stub` 26/26 pass, no page or console errors. Every worked example in the revised spec matches what the code produces; no discrepancies found.
3. **Next:** security re-check of the small diff, then QA phase 2 against the revised ACs (AC-1, 5, 10, 25–28).

### Changes
| Item | Change |
|---|---|
| D-1 `wordsRec()` | `clampN(Math.floor(pics()/langs().length),3,4)`. `langs()` always has ≥1 entry, so no `max(L,…)` guard. Comment updated. At the defaults (8 pictures, 3 languages) rec = 3, so the hint reads "Recommended for her: 3. …". |
| D-2 `buildPlan()` pair order | Need order inside an object is unchanged (miss → new → stale → review oldest first → heard today). The last tie-break is now `(L.indexOf(lang) - i%L.length + L.length) % L.length` with `L = langs()` and `i` = the object's slot. The old fixed `W={en,de,es}` map is removed. |
| D-3 `renderWordsSetting(pairs)` | Now takes `pairs` = `buildPlan().length` (passed from `render()`), not the capped object count. Order: T > P → "Only {P} words fit in {P} pictures."; mode `rec` → empty; pairs > P → "Every word comes up at least once. A few languages wait for the next lesson; {pairs} pictures fit them all."; else empty. |

### Verification (actual runs, same harness as §3)
- **Updated expectations:** AC-1 (input 3, hint "Recommended for her: 3.", note empty). Rec table 8/3→3, 9/3→3, 12/3→4, 8/2→4, 8/1→4, 6/3→3. AC-2 queue `book-en, spoon-de, dog-es, cat-en, book-de, spoon-es, dog-en, cat-de, book-es, spoon-en, dog-de, cat-es` (one + tap from 3 to 4). AC-6 `dog-en, book-de, dog-de, book-es, dog-es, book-en, dog-en, book-de`. AC-8 title is now "6 friends, 3 languages" with first languages en, de, es, en, de, es (matches the spec's edge-case row). AC-10 input 3, Today "3 friends, 3 languages" / "… 3 words · 8 pictures · ~4 min". Stub: new child shows 3, hint 3, note empty, and two + taps reach 5.
- **New checks:** AC-25 queue `dog-en, cat-de, ball-es, dog-de, cat-es, ball-en, dog-es, cat-en`, title and meta, played = preview. AC-28: next lesson's objects are ball, apple, dog, and the queue starts with ball-de. AC-26: note empty in rec at 8/3 and 6/3. AC-27: H8 fixed 4 at 8 pictures gives the gentle note with "12 pictures", which is empty at 12 pictures. Random draw 5 (k=2): words 2, 2, 2, 1, 1 times, note with "15 pictures". AC-5(a): book, spoon, dog, cat, ball, 2 unheard + 3 review. AC-5(b): fresh child fixed 5 gives dog, cat, ball, apple, car.
- **Retry test changed:** with rec 3 the default H8 lesson has 8 distinct pairs in 8 pictures, so R-W5 correctly skips the retry (now checked as such). The "retry with room" case uses fixed 2 instead: book-en is missed, retried at turn 5, and all 6 planned pairs are still played in 8 turns.
- **Static checks:** `node --check` OK. Protected files unchanged: `index.html` a78010d861a3920a, `uat/index.html` 4c355937f568ba8d, combined `family-buddy/ supabase/migrations/ uat/` 427024bc309ac481. The only repo file changed is `dev/index.html` (plus this note). Server stopped afterwards.

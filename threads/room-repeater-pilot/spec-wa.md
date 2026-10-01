# Spec: Increment WA — "Words per lesson" + "Animal families"

BA/PO, 2026-10-01 (revised the same day after Tom's answers). Target: `dev/index.html` only, legacy (`?backend=off`) and account (stub / Supabase) modes. Builds on `sprint.md`; it adopts the Scrum Master's framing points 1–4. Point 2 (Random) is narrowed in R-W4.

## Change log 2026-10-01 (Tom's answers)

Tom decided: (1) the recommendation is never below 3 words; (2) Random 2–5 is approved; (3) the 12 accessories are approved. QA's spec defects SD-1…SD-3 and the architect's SPEC CHANGE lines (already in code) are folded in.

| Item | Change | Code impact |
|---|---|---|
| Def. **rec** | `clamp(floor(pics()/L), 3, 4)`. Was `clamp(floor(pics()/max(L,2)), 2, 4)`. Examples table updated (8/3 → **3**). | **yes** (`wordsRec`) |
| **R-W2** pair order | Last tie-break inside an object is now **rotated by slot index**, not plain en, de, es. | **yes** (`buildPlan` sort) |
| **R-W2** step 5 (SD-1) | Clarified: step 5 adds brand-new objects only after every heard object has been offered (step 4 exhausted). So "max 2 new" holds whenever there is something to review; a fresh child gets the full N. | none (code already does this) |
| **R-W3** | Worked example for the default 3 × 3 at 8 pictures. Guarantee restated: every chosen word at least once. | none beyond R-W2 |
| **R-W1** / R-W7 typing (SD-3) | `""`, `null`, booleans and non-numeric strings → `"rec"`. | none (code already does this) |
| **R-W7** fit note | Language note is **not shown in `"rec"` mode**. In fixed/Random mode it has new, neutral wording and counts real pairs (Σ languages per word). | **yes** (`renderWordsSetting`) |
| **R-W8** | Self-heal from architecture-wa §2 written in. | none (applied) |
| **R-A2** (SD-2) | Gifts without a valid `day` are not shown, not counted, and don't take part in the next-animal rule. Tie-break by gift id from architecture-wa §3 written in. | none (applied) |
| Roster note, edge `{}` row | From architecture-wa §4, §7.1. | none (applied) |
| Non-goals, Assumptions 1–3, 9–10, Open for Tom | Updated; Open for Tom → None. | — |
| ACs | **Changed:** AC-1, AC-5, AC-10 (value), AC-13 (arch extension). **New:** AC-25 (default lesson), AC-26 (no note in rec mode), AC-27 (gentle note in fixed mode), AC-28 (missing language comes back next lesson). AC-2, AC-3, AC-6 wording unchanged but their exact queues change through the rotation. | — |

## Problem & business impact

1. **Words per lesson.** The parent can't control how many different things a lesson shows. Today it falls out of rules 1–4 and the language interleave, so with the defaults (8 pictures, 3 languages) the lesson shows about 2–3 objects, and an object can get cut off after its English. The real problem is that a toddler retains new words better when the set is small and each word comes back often. The parent needs one clear control, plus a sensible default they don't have to think about.
2. **Animals that feel unlimited.** After 12 finished lessons the child only ever gets repeats ("Rabbit is here again!"). The reward stops being a surprise at about lesson 13. For a 3-year-old, a new friend each time is the main pull to finish a lesson. With a 40-animal roster plus families that keep growing, every finished lesson brings someone new, with no new backend.

If we don't build it, the reward gets stale after 12 lessons and lesson size stays opaque. Cost: client-only, one file, no schema change (to be confirmed by the architect).

## Goals / Non-goals

**Goals:** a 2–8 "Words per lesson" control with a live recommendation and a Random option, applied exactly to the next lesson and shown on the Today card. A 40-animal roster, where each finished lesson adds one new family member and the collection never "runs out".

**Non-goals (out of scope for WA):** changing rule 3 (max 2 new) beyond the sparse-history top-up in R-W2 step 5, changing rule 4 (drop), or the Pictures range (6–30). Per-language word counts. Choosing an animal. Animal sounds. Naming animals. Badges or streaks. A DB migration. Any change to `uat/`, root `index.html` or `family-buddy/`.

## Current behavior (dev/index.html)

- `buildPlan()` (l.649) returns *pairs* (object|lang): yesterday's misses, then stale (≥4 days), then up to 2 new objects × unheard languages, then every other known pair as review. There is no object limit.
- `buildQueue()` (l.687) interleaves *by language* (all EN pairs, all DE pairs …), then appends the base 6× as review. `render()` (l.705) and `startSession()` (l.830) both cut it at `pics()`. Objects later in the plan can be cut. A miss re-inserts at index ≤3 (`runTurn` l.811), which can push planned pairs past the cap.
- Today card (l.708/712): `planTitle` = "N friends, L languages" from the first `pics()` items. `planMeta` = "X words · Y pictures · ~Z min", where X counts *pairs*.
- Settings: `S.settings={en,de,es,pics,parent,off}`. `settingsObj()` l.1262. `applySettings()` l.1264 changes only the keys it is given. Legacy loads by `Object.assign` (l.599) with no validation, and `pics()` clamps on read.
- Animals: `ANIMALS` (l.545) has 12 entries and cycles by `S.earned.length % 12` in `reveal()` (l.856) and `found()` (l.866). `renderAnimals()` (l.885) shows the pill "x / 12" and distinct animals. `renderZoo()` (l.893) shows a 12-tile grid with a ×count badge. `aid()` (l.945) reads both gift shapes. `merge()` (l.1357) sorts `S.earned` by day; JS sort is stable, so ties keep their arrival order.

---

## Part 1 — Words per lesson

### Definitions

- **Words** = distinct objects ("friends") in one lesson. Each one is practised in its active, non-dropped languages.
- **Eligible object**: an object in `activeWords()` with at least one pair in an active language that is not dropped.
- **Mode** (stored as `S.settings.lessonWords`): an integer `2…8` (fixed), the string `"rec"` (follow the recommendation), or the string `"random"`. **Default `"rec"`** for new and existing users. A missing or invalid value means `"rec"`.
- **rec** (the recommendation) = `clamp(floor(pics() / L), 3, 4)`, where L = number of active languages (1–3; the app never allows 0, unchecking all re-checks EN). Tom's rule (2026-10-01): never fewer than 3 words. The cap of 4 stays: the studies below favour few competitors, and with 1–2 languages anything above 4 would only come from the picture count, not from what helps the child. Aim: few words, each heard at least once, most of them in every language.
  - L=1: `floor(pics/1)` ≥ 6, so rec is always **4**.
  - L=2: 6–7 pictures → **3**; 8+ pictures → **4**.
  - L=3: 6–11 pictures → **3** (the floor of 2 or 3 is lifted to 3); 12+ → **4**.

  | Pictures / languages | 6/3 | **8/3 (default)** | 9/3 | 11/3 | 12/3 | 6/2 | 8/2 | 6/1 | 8/1 |
  |---|---|---|---|---|---|---|---|---|---|
  | rec | 3 | **3** | 3 | 3 | 4 | 3 | 4 | 4 | 4 |

  When rec × L > pictures (e.g. the default 3 × 3 = 9 pairs in 8 pictures), not every pair fits. That is intended; R-W3 decides what is left out. The fixed range stays 2–8 and Random stays 2–5 (Tom approved): only the *recommendation* has the floor of 3.
- **Lesson index k** = number of entries in `S.earned` with `day === today()`. This is the number of lessons finished today, counting gifts already synced from other devices.
- **Random draw** = `2 + (fnv1a32(today() + "|" + k) % 4)`, which gives 2–5. FNV-1a 32-bit over UTF-8 (offset 0x811c9dc5, prime 0x01000193). Test vectors: `2026-10-01|0`→3, `2026-10-01|1`→4, `2026-10-01|2`→5, `2026-10-02|0`→2.
- **Target T** = the mode's number (fixed value, rec, or the random draw).
- **Effective N** = `min(T, pics(), eligibleCount)`.

### Required behavior

**R-W1 Storage and validation.**
- Add the accessor `lessonWordsMode()`:
  - returns `"rec"` or `"random"` when the stored value is exactly that string;
  - else, if v is a number or a non-empty numeric string, takes `n = Math.round(+v)` and returns `clamp(n, 2, 8)` if n is finite;
  - else returns `"rec"`. This covers `""`, `null`, `undefined`, booleans and non-numeric strings (SD-3).
- Every reader uses this accessor (like `pics()`), so corrupt legacy localStorage can't break the app.
- `settingsObj()` adds `lessonWords: lessonWordsMode()`.
- `applySettings()` only acts when `o.lessonWords !== undefined`, and then stores the validated value. Settings without the key leave the local value alone (same pattern as `off`).
- `resetS()` and the account `createChild` default settings (l.1218) include `lessonWords:"rec"`.
- The pilot import (`doImport`) carries the field through `applySettings` unchanged.

**R-W2 Plan: choosing the N objects.** `buildPlan()` keeps rule 4 (drop) and its side effect. It then fills N object slots in this order:
1. **Misses:** objects with a pair missed yesterday (the current `yesterday` filter).
2. **Stale:** objects with a pair last heard ≥4 days ago.
3. **New:** objects that are still new (any active language unheard), in `activeWords()` order, at most `min(2, N)`.
4. **Review:** remaining objects with any heard pair, sorted by the most recent `last` across their pairs, oldest first. Objects heard today come last, so "Play again" gets different objects when the pool allows.
5. **Top-up:** any remaining eligible objects in `activeWords()` order. After step 4 the only objects left are ones with no heard pair at all, so this step only runs when every heard object has already been offered (SD-1, decided). Effect: "max 2 new" holds whenever there is anything to review; a child with a short history (fresh child: none) gets the full N anyway, filled with further brand-new objects. Reason: with a recommendation of at least 3, a strict cap would give a fresh child only 2 words in lesson 1, below Tom's floor.

**Reservation:** if at least one eligible new object exists, steps 1+2 together take at most N−1 slots, so every lesson meets something new until the pool is exhausted.

Within a step, the existing order is kept and duplicates are skipped. `buildPlan()` still returns a pair list (so `dinnerWords()` keeps working), now limited to the chosen objects. The pairs are ordered by slot (i = 0, 1, … in the order chosen). Within an object they are ordered by language need: miss → new (unheard) → stale → review (oldest `last` first) → heard today. **Ties** (same need class and, for review, the same `last` day) are broken by the **rotated language order**: take the active languages in en, de, es order (`langs()`, length L) and start at position `i mod L`. Object 0 ties as en, de, es; object 1 as de, es, en; object 2 as es, en, de; object 3 as en, de, es again (with 3 languages). Each pair carries `why`. Why rotate: when not all pairs fit (R-W3), the pair that is left out is then a different language for different objects instead of always Spanish.

**R-W3 Queue.**
- `buildQueue(plan)` runs round-robin over objects in slot order. In round r, object i contributes `langs_i[r % len_i]`, where `langs_i` is its need-ordered language list.
- Rounds repeat until the queue has at least `pics()` items. Items after the first pass get `why:'review'`.
- Result: N ≤ `pics()` always holds (Effective N), so **every chosen word appears at least once**, in the first N pictures. With `pics() ≥ Σ len_i`, every chosen pair appears.
- **When not all pairs fit** (Σ len_i > `pics()`, which is the default case 3 × 3 = 9 > 8): round r gives every object its r-th most needed language, so the pairs left out are each object's *least* needed ones, and they fall on the *last* objects in slot order. Because of the R-W2 rotation, they are different languages for different objects.
- **Across lessons** no extra rule is needed: a pair left out stays unheard, so its object stays "new" (R-W2 step 3) and that pair ranks first inside the object next time.
- **Worked example (fresh child, defaults: 8 pictures, en/de/es, rec 3, legacy order dog, cat, ball):** dog → en, de, es; cat → de, es, en; ball → es, en, de. Queue: dog-en, cat-de, ball-es, dog-de, cat-es, ball-en, dog-es, cat-en. Left out: ball-de. Every word appears 2–3 times; EN 3×, DE 2×, ES 3×. In lesson 2 (all said in lesson 1) the objects are ball, apple (new), dog (review), and ball's first item is ball-de.

**R-W4 Random.**
- In `"random"` mode, T is the random draw for (today, k).
- Preview and session use the same function on the same state, so they always agree.
- After a finished lesson, k+1 gives a new draw for the next lesson. An unfinished lesson keeps the same draw.

**R-W5 Missed-word retry may not displace planned pictures.**
- At session start, record P0 = the set of pairs in `queue.slice(0, cap)`.
- When a miss would be re-inserted (`runTurn` l.811), build the tentative queue as today. Accept it only if every pair of P0 that has not been played yet is still inside `tentative.slice(0, cap - turnNo)`. Otherwise skip the retry; the word comes back in a later lesson as a miss.

**R-W6 Today card shows exactly the lesson.**
- `planTitle`: unchanged formula over `buildQueue(buildPlan()).slice(0, pics())`, so it equals "N friends, L languages".
- `planMeta`: `[<turns-today prefix as today>]` + `"{N} words{ (random)} · {P} pictures · ~{Z} min"`. N now counts distinct objects, not pairs. " (random)" appears only in Random mode.
- `planList` is unchanged: the first 3 objects with their languages, then "+ M more". It is built from the capped queue, so an object whose third language was left out (R-W3) shows only the two tags it really gets. That is the honest preview, and no extra text is added.
- No warning or note appears on the Today card for left-out pairs.
- The card re-renders right after any change to words, pictures or languages.

**R-W7 Settings UI.** Put a new `.set` row in the "Session" `.group`, **above** "Pictures per session", and a switch row below it:
- **Row A:** label "Words per lesson" with `<small id="optWordsHint">`, then a `.stepper` with `wordsMinus` (−, aria-label "Fewer words") / `input#optWords` (type number, min 2, max 8) / `wordsPlus` (+, aria-label "More words").
  - The input shows T. In Random mode it shows today's draw, and the input and both buttons are disabled.
  - − and + step from the displayed value, clamp to 2–8, and set fixed mode. Typing works the same way: 2–8, otherwise clamped. An empty field or a non-numeric entry sets `"rec"` (SD-3), and the input then shows rec.
  - The input ignores `change` events while it is disabled or in Random mode (found by the developer: Chrome fires `change` on blur after a pull disabled the field).
- **Hint text (`optWordsHint`):**
  - mode `"rec"`: "Recommended for her: {rec}. A few words heard often tend to stick better for toddlers." (unchanged; at the defaults it now reads 3)
  - fixed mode: "Recommended: {rec}" plus a link-style button `wordsRec` "Use recommended", which sets `"rec"`.
  - Random: "Random each lesson: 2–5 words."
- **Row B:** label "Random each lesson" with `<small>2–5 words, changes after each finished lesson</small>`, and a switch `input#optWordsRandom.switch`. Checking it sets `"random"`. Unchecking sets `"rec"`.
- **Fit note (`optWordsNote`, muted, below the group, empty otherwise).** Let **pairs** = Σ len_i over the N chosen objects (the lesson's distinct word–language pairs; equals N × L unless an own word lacks a language). Evaluated in this order:
  1. T > pics() (only possible in fixed mode, since rec ≤ 4 and Random ≤ 5 are below the 6-picture minimum): "Only {pics} words fit in {pics} pictures." (unchanged)
  2. mode is `"rec"`: **no note**, even when pairs > pics(). This is the default case and the recommendation already accepts it, so the screen stays calm.
  3. fixed or Random mode and pairs > pics(): "Every word comes up at least once. A few languages wait for the next lesson; {pairs} pictures fit them all." Neutral tone, no "only", no "not".
  4. otherwise: empty.
- Every change calls `save(); render();`. In account mode `save()` queues the settings via the existing outbox.
- No "proven" or medical claims anywhere. The sources are listed below, for the record only, not in the app.

**R-W8 Sync.** In account mode the field travels inside `children.settings` with the existing last-write-wins (`settings_updated_at`). A pulled value goes through the R-W1 validation. A server settings object without `lessonWords` (written by an older client) does not change the local value. **Self-heal** (architecture-wa §2): when such a pulled object is applied while the local `lessonWordsMode()` is not `"rec"`, set `A.lastSettings = ''`, so the next `save()` re-queues the merged settings and puts the key back on the server. In `"rec"` mode nothing is queued.

**Evidence for the recommendation** (source: the studies, wording in the app is mine and modest):
- Horst, Scott & Pollard (2010), *Developmental Science*: 30-month-olds mapped words with 2, 3 or 4 competitor objects, but only those with few competitors retained the words. https://onlinelibrary.wiley.com/doi/10.1111/j.1467-7687.2009.00926.x
- Schwab & Lew-Williams (2016), *Developmental Psychology* 52(6): 2-year-olds learned novel labels only when the repetitions came close together. https://doi.org/10.1037/dev0000125 ([ERIC](https://eric.ed.gov/?id=EJ1102402))
- Horst, Parsons & Bryan (2011), *Frontiers in Psychology*: repeating the same stories helped 3-year-olds learn words more than varied stories. https://pmc.ncbi.nlm.nih.gov/articles/PMC3111254/

None of these studied trilingual apps. The cap of 4 (few words) is my inference from them, not a finding. The floor of 3 is Tom's product decision (2026-10-01).

### Edge cases (words)

| Situation | Expected |
|---|---|
| Pool has 0 eligible objects | Unchanged R17 empty state (`plan-empty`), Start disabled |
| Pool has 1 eligible object, setting 4 | N=1; title "1 friend, L languages"; meta "1 words" → write "1 word" (singular) |
| Pool has 2 eligible objects, mode rec (3) | N=2; the floor of 3 applies to the recommendation, not to the pool; no note |
| Default: fresh child, 8 pictures, 3 languages, rec | N=3, 8 of 9 pairs played (R-W3 worked example); `words-note` empty |
| Rec at 6 pictures, 3 languages | rec 3, 6 of 9 pairs (each word twice, in 2 languages); no note |
| Fixed 4, 8 pictures, 3 languages | 8 of 12 pairs, each word twice; note "Every word comes up at least once. A few languages wait for the next lesson; 12 pictures fit them all." |
| Random draw 5, 8 pictures, 3 languages | 8 of 15 pairs: words 1–3 twice, words 4–5 once; same gentle note with "15 pictures" |
| Fresh child, fixed 5 (SD-1) | 5 objects, all new: 2 from step 3, 3 from the top-up (nothing heard to review) |
| 1 heard object, fixed 5 | 2 new (step 3) + the heard one (step 4) + 2 top-up new = 5 |
| Setting 8, pictures 6 | N=6, every object once; with tied needs (e.g. seed H8) the first languages rotate en, de, es, en, de, es, so title "6 friends, 3 languages"; fit note "Only 6 words fit in 6 pictures." |
| All new objects used up | Reservation doesn't apply; slots filled by misses/stale/review |
| An object's active languages all dropped | Not eligible |
| Own word with only a DE text, DE active | Eligible, `langs_i=[de]` |
| Languages switched mid-day | rec and the plan recompute at the next render |
| Stored value `"abc"`, `1`, `99`, `3.6`, `null`, `""`, `true`, `"5"` | `"rec"`, 2, 8, 4, `"rec"`, `"rec"`, `"rec"`, 5 |
| Typed value empty or `"abc"` | mode `"rec"`, input shows rec |
| Old client saves settings without the key | Server copy lacks it; new clients keep their local value; a fresh device starts at `"rec"` |
| Random mode, gift from another device synced before Start | k changes, preview re-renders with the new draw; session uses the same |

---

## Part 2 — Animal families

### Roster (replaces `ANIMALS`, same object shape `{id,e,en,de,es}`)

The first 12 are unchanged, with the same ids and order. Every emoji is a single code point (🐿️ adds VS16). There are no ZWJ sequences and no skin-tone or gender variants. Unicode version is from my own knowledge; the architect should verify rendering.

| # | id | e | en | de | es | Unicode |
|---|---|---|---|---|---|---|
|1|rabbit|🐇|rabbit|Hase|conejo|6.0|
|2|duck|🦆|duck|Ente|pato|9.0|
|3|elephant|🐘|elephant|Elefant|elefante|6.0|
|4|giraffe|🦒|giraffe|Giraffe|jirafa|10.0|
|5|turtle|🐢|turtle|Schildkröte|tortuga|6.0|
|6|penguin|🐧|penguin|Pinguin|pingüino|6.0|
|7|owl|🦉|owl|Eule|búho|9.0|
|8|snail|🐌|snail|Schnecke|caracol|6.0|
|9|butterfly|🦋|butterfly|Schmetterling|mariposa|9.0|
|10|octopus|🐙|octopus|Krake|pulpo|6.0|
|11|flamingo|🦩|flamingo|Flamingo|flamenco|**12.0**|
|12|camel|🐪|camel|Kamel|camello|6.0|
|13|cat|🐈|cat|Katze|gato|6.0|
|14|dog|🐕|dog|Hund|perro|6.0|
|15|pig|🐖|pig|Schwein|cerdo|6.0|
|16|cow|🐄|cow|Kuh|vaca|6.0|
|17|horse|🐎|horse|Pferd|caballo|6.0|
|18|sheep|🐑|sheep|Schaf|oveja|6.0|
|19|goat|🐐|goat|Ziege|cabra|6.0|
|20|chick|🐤|chick|Küken|pollito|6.0|
|21|mouse|🐁|mouse|Maus|ratón|6.0|
|22|hedgehog|🦔|hedgehog|Igel|erizo|10.0|
|23|squirrel|🐿️|squirrel|Eichhörnchen|ardilla|7.0 (+VS16)|
|24|bear|🐻|bear|Bär|oso|6.0|
|25|panda|🐼|panda|Panda|panda|6.0|
|26|koala|🐨|koala|Koala|koala|6.0|
|27|monkey|🐒|monkey|Affe|mono|6.0|
|28|lion|🦁|lion|Löwe|león|8.0|
|29|zebra|🦓|zebra|Zebra|cebra|10.0|
|30|hippo|🦛|hippo|Nilpferd|hipopótamo|11.0|
|31|kangaroo|🦘|kangaroo|Känguru|canguro|11.0|
|32|sloth|🦥|sloth|Faultier|perezoso|**12.0**|
|33|frog|🐸|frog|Frosch|rana|6.0|
|34|fish|🐠|fish|Fisch|pez|6.0|
|35|whale|🐳|whale|Wal|ballena|6.0|
|36|dolphin|🐬|dolphin|Delfin|delfín|6.0|
|37|crab|🦀|crab|Krabbe|cangrejo|8.0|
|38|ladybug|🐞|ladybug|Marienkäfer|mariquita|6.0|
|39|bee|🐝|bee|Biene|abeja|6.0|
|40|parrot|🦜|parrot|Papagei|loro|11.0|

There are no articles in the names (the current style). The only predator is the lion. 🦩 and 🦥 need Emoji 12 = Android 10+, which is also the minimum for current Chrome (139+). 🐿️ must be stored as U+1F43F U+FE0F (architecture-wa §4). Some names repeat built-in words (cat, dog, pig, …) with a different emoji (full body), which reinforces the words and does no harm.

### Accessories (member ≥2)

`ACC = ['🎀','🎩','👑','🧢','🕶️','🎈','🌸','⭐','🧣','👓','🎒','🌼']` (all Unicode ≤10; 🕶️ includes VS16). **Approved by Tom 2026-10-01.** Member k≥2 gets `ACC[(k-2) % 12]` and a small number badge "k". Member 1 is plain. Beyond 13 members the accessories repeat, but the number keeps each member unique, so it never runs out. No "mama/baby" naming.

### Required behavior

**R-A1 Roster.** `ANIMALS` = the 40 rows above, in that order. Ids are ≤32 characters (gifts.animal check).

**R-A2 Counting and order.**
- A **known gift** is an `S.earned` entry whose `aid()` is a roster id **and** whose `day` is a valid `YYYY-MM-DD` string. Only known gifts are shown, counted (`familyCounts()`, F, M) and used by the next-animal rule (SD-2, decided; matches architecture-wa §7.1 and the code).
- Other entries are kept in `S.earned`:
  - unknown id with a valid day (e.g. `unicorn` from a future build): synced as before (passes `okGift`), and still counted in the Random lesson index k (architecture-wa §6);
  - no valid day or no string `aid` (malformed): legacy keeps it; account keeps it locally but **does not queue it** (`acctSave()` skips entries that fail `okGift()`).
- **Member order** within a family (display and numbering only, on a copy; `S.earned` and `merge()` stay unchanged): `day` ascending, then the account gift uuid `String(id)` ascending, then index in `S.earned`. Legacy-shape entries `{id,day}` have no uuid and fall through to index. The same order picks the "newest 4" in R-A6. The member number k is the 1-based position.
- The number is never stored. Gifts keep storing only the base id, in both shapes: legacy `{id,day}` and account `{id:uuid, animal, day}`.

**R-A3 Next animal.**
- `nextAnimal()` = the roster animal with the fewest members; ties go to the lowest roster index.
- `reveal()` and `found()` both use it instead of `n % 12`. Pulls never apply mid-session (existing `inSession()`), so the silhouette always matches the gift.
- Worked examples:
  - 0 gifts → rabbit.
  - 5 gifts (rabbit…turtle) → penguin (same as today).
  - 13 gifts (12 + a second rabbit) → **cat** (#13, 0 members), followed by dog, pig … parrot.
  - After all 40 have 1 member and rabbit has 2 → **duck** (2nd duck). Rabbit's 3rd comes only after every family has 2.

**R-A4 Celebration (`found()`).**
- `partyArt` shows the member: base emoji plus accessory when k≥2.
- `partyText`:
  - k=1: "{Name} is here!"
  - k=2…10: "A {second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth} {name} joined the {name} family!"
  - k≥11: "{Name} number {k} joined the {name} family!"
- `partyShelf` shows this animal's family members in order (the last 8 if more, prefixed "+{hidden}"), with the new one in `<span class="new">`.
- `sayNames(a)` is unchanged: it speaks the base name in each active language.
- Strings "is here again!" and "that's all 12!" are removed.

**R-A5 Halfway reveal.** `#card` shows the silhouette of `nextAnimal().e` (base emoji only, no accessory or number, so the accessory stays a surprise). Text and timing are unchanged.

**R-A6 Today "Animal friends" card.**
- `animalsCount` pill: "{F} friends" (F = known gifts; "1 friend").
- `animalsMeta`:
  - no gifts: unchanged ("Finish today's session to meet the first one.")
  - otherwise: "{M} famil{y|ies} · someone new comes after the next session."
- `friendRow`: the newest 4 known gifts (member order across all, newest last) as member markup, then the `?` slot, then empty slots up to 5.

**R-A7 Animals tab.**
- `zooMeta`:
  - no gifts: unchanged
  - otherwise: "{F} friends · {M} families · tap one to hear its name"
- `zooGrid`, in this order:
  - (a) one tile per family with ≥1 member, in roster order: `button.tile[data-animal=id][data-state=earned][data-count=k]`, showing member 1 and the existing `×k` badge when k>1;
  - (b) one `[data-state=next]` tile with the silhouette of `nextAnimal()`, always present;
  - (c) an egg tile (`.tile.later`) for each roster animal with 0 members that is not the next one.
  - For a history that follows the old cycle, round 1 looks exactly like today.
- Tapping a family tile: `zooSay` shows the existing names line plus `<div data-testid="zoo-family">` with all members (base + accessory + number badge for k≥2), and speaks the names as today.
- Tapping the next tile: unchanged.

**R-A8 Member markup** (one helper, used in R-A4/6/7): `<span class="mem" data-member="k">{e}<span class="acc">{ACC}</span><b class="num">{k}</b></span>`. The `.acc` part appears only when k≥2. `.num` appears only for k≥2 and only in `zoo-family`. CSS: the accessory sits top-right at 45% of the font size; it must not change tile size. Text goes through `esc()` or `textContent` as today.

### Edge cases (animals)

| Situation | Expected |
|---|---|
| Legacy history `[{id:'rabbit'},…×12,{id:'rabbit'}]` | 12 families, 13 friends; next = cat; Rabbit tile ×2 |
| Account gift `{animal:'unicorn'}` pulled from a newer build | No crash; not counted or shown; still in `S.earned` and still synced |
| Two devices each earn a gift offline on the same day | Both kept (different uuids); each device picked its next animal on its own, so possibly the same family; numbering follows R-A2; no error |
| Pilot import of 30 legacy gifts | Imported as today; counts per R-A2 |
| 100 finished lessons | 40 families; 20 have 3 members, 20 have 2; next = the 21st animal (3rd member) |
| `S.earned` entry `{}`, or `{id:'cat'}` / `{animal:'cat'}` without `day` | Not shown, not counted, no effect on the next animal; no crash. Legacy: kept. Account: kept locally, **not queued**, outbox still drains |

---

## Data & interfaces

- `S.settings.lessonWords`: `2|3|4|5|6|7|8|"rec"|"random"`. Added to `settingsObj()`, so ~20 bytes more in `children.settings` (limit 4096).
- Gifts: unchanged shape and values (base roster id). No schema change is expected (architect to confirm).
- Read-only QA hooks (pattern of `RR_WORDS`):
  - `window.RR_LESSON = {mode(), target(), n(), rec(), queue()}`, where `queue()` = `buildQueue(buildPlan()).slice(0,pics())` as `[{obj,lang}]`.
  - `window.RR_ANIMALS = {roster(), next(), counts()}` (copies).

## New IDs / data-testids (all existing IDs and data-testids are kept)

| Element | id | data-testid |
|---|---|---|
| words stepper − / input / + | `wordsMinus` / `optWords` / `wordsPlus` | `words-minus` / `words-per-lesson` / `words-plus` |
| hint text | `optWordsHint` | `words-hint` |
| Use recommended | `wordsRec` | `words-rec` |
| Random switch | `optWordsRandom` | `words-random` |
| fit note | `optWordsNote` | `words-note` |
| family strip in zooSay | — | `zoo-family` |
| tile attribute | `data-count` on earned tiles; `data-member` on `.mem` | — |

Add `data-testid="plan-meta"` to `#planMeta` when it is not in the empty state. `plan-empty` keeps priority.

## Acceptance criteria

**Words per lesson**

- **AC-1** (default) Given a new or existing user with no `lessonWords`, 3 languages and 8 pictures. When Settings opens, then `words-per-lesson` shows **3**, `words-hint` reads "Recommended for her: 3. …", `words-random` is off, and `words-note` is empty. *(changed 2026-10-01)*
- **AC-2** (fixed) Given legacy mode and a pool of ≥4 eligible objects. When the parent taps + until 4 and pictures is 12, then the Today title reads "4 friends, 3 languages", `plan-meta` contains "4 words · 12 pictures", and `RR_LESSON.queue()` holds exactly 4 distinct objects.
- **AC-3** (session = preview) Given fixed 4 and 12 pictures. When a lesson is finished with every answer "said", then the set of objects played equals the preview set, and every previewed pair was played.
- **AC-4** (retry can't cut) Given fixed 8 and 8 pictures. When the child misses the first picture, then all 8 planned objects are still shown before the lesson ends.
- **AC-5** (max 2 new, top-up) *(changed 2026-10-01, SD-1)*
  - (a) Given a child with at least 3 heard objects (seed H8: 8 heard) and fixed 5. When the plan is built, then exactly 2 of the 5 objects have an unheard pair and 3 come from review (H8: book, spoon, dog, cat, ball).
  - (b) Given a fresh child and fixed 5. When the plan is built, then the lesson has 5 objects, all new, in `activeWords()` order (legacy: dog, cat, ball, apple, car).
- **AC-6** (reservation) Given 2 objects missed yesterday, new objects available, and N=2. When the plan is built, then exactly 1 slot is a miss and 1 is new.
- **AC-7** (small pool) Given only 1 eligible object and fixed 4. When Today renders, then the title reads "1 friend, …" and the meta reads "1 word · …".
- **AC-8** (fit note) Given fixed 8 and 6 pictures. When Settings renders, then `words-note` reads "Only 6 words fit in 6 pictures." and the title shows 6 friends.
- **AC-9** (random deterministic) Given Random on, the date 2026-10-01 and 0 lessons finished today. When Today renders, then the meta shows "3 words (random)", and starting the lesson plays 3 objects. After finishing it, the preview shows 4.
- **AC-10** (use recommended) Given fixed 6. When the parent taps `words-rec`, then the mode becomes `"rec"`, the stepper shows the current rec (3 at 8 pictures / 3 languages), and the Today card updates to "3 friends, 3 languages" / "3 words · 8 pictures · ~4 min".
- **AC-11** (legacy validation) Given localStorage `settings.lessonWords` = "abc" (then 99). When the app loads, then it behaves as `"rec"` (then 8) without errors.
- **AC-12** (account sync round trip) Given account mode on phones A and B (stub). When A sets 5, syncs, and B pulls, then B's `words-per-lesson` shows 5 and B's preview uses 5. Setting Random on B and pulling on A gives Random on A.
- **AC-13** (old client) Given the server settings were written without `lessonWords`, and the local value is 5. When a pull applies them, then the local value stays 5, and after the next sync the server settings contain `lessonWords: 5` (self-heal). In `"rec"` mode no settings push happens.
- **AC-14** (size) Given account mode. When settings save with `off` holding every built-in id (all 61 `OBJECTS`) and `lessonWords:"random"`, then `okSettings` passes (≤4096).
- **AC-25** (default lesson, new) Given a fresh legacy child with defaults (8 pictures, en/de/es, `"rec"`). When Today renders, then the title reads "3 friends, 3 languages", `plan-meta` contains "3 words · 8 pictures · ~4 min", and `RR_LESSON.queue()` = dog-en, cat-de, ball-es, dog-de, cat-es, ball-en, dog-es, cat-en (each word ≥1×, each language ≥2×).
- **AC-26** (no note in rec mode, new) Given `"rec"` mode at 8 pictures / 3 languages (9 pairs > 8) and again at 6 pictures. When Settings renders, then `words-note` is empty both times.
- **AC-27** (gentle note, new) Given seed H8, fixed 4, 8 pictures, 3 languages. When Settings renders, then `words-note` reads "Every word comes up at least once. A few languages wait for the next lesson; 12 pictures fit them all." When pictures go to 12, then it is empty.
- **AC-28** (left-out language returns, new) Given the AC-25 lesson finished with every answer "said". When Today renders, then the lesson objects are ball, apple, dog, and the queue starts with ball-de.

**Animals**

- **AC-15** (continuity) Given legacy `S.earned` = the 12 original animals in order plus a second rabbit. When the next lesson is finished, then the reveal silhouette was 🐈 and the party says "Cat is here!".
- **AC-16** (second member) Given every roster animal has 1 member and rabbit has 2. When a lesson is finished, then the gift is `duck`, `partyArt` shows 🦆 with 🎀, and `partyText` reads "A second duck joined the duck family!".
- **AC-17** (ordinal cap) Given cat has 10 members and is next. When the gift arrives, then the text reads "Cat number 11 joined the cat family!".
- **AC-18** (unlimited) Given 100 simulated finished lessons from empty. Then every gift differs from the previous one by (id, member number), `RR_ANIMALS.counts()` has 40 keys with 20×3 and 20×2, and no error is thrown.
- **AC-19** (totals) Given 13 gifts (12 + rabbit). Then `animalsCount` reads "13 friends", `animalsMeta` begins "12 families", and `zooMeta` reads "13 friends · 12 families · tap one to hear its name".
- **AC-20** (zoo grid) Given 13 gifts as above. Then the grid shows 12 earned tiles (rabbit `data-count=2` with "×2"), then one `data-state=next` tile with the 🐈 silhouette, then 27 egg tiles.
- **AC-21** (family strip) Given rabbit has 2 members. When the rabbit tile is tapped, then `zoo-family` shows 🐇 and 🐇+🎀 with badge "2", and the names are spoken in the active languages.
- **AC-22** (account shape + sync) Given account mode (stub) on phones A and B. When A finishes a lesson and B pulls, then B shows the same family counts. The pushed gift row is `{id:uuid, animal:<base id>, day}`.
- **AC-23** (unknown id) Given an account pull containing a gift `animal:"unicorn"`. Then the app renders without errors, the counts exclude it, and the row stays in `S.earned`.
- **AC-24** (import) Given a legacy pilot key with 13 gifts. When it is imported into an account, then AC-19's totals hold in account mode.

## Affected code

`dev/index.html` only:
- CSS: `.mem`, `.acc`, `.num`, and the `zoo-family` strip.
- Settings HTML (around l.426).
- `ANIMALS` (l.545); `pics()` neighbour gets `lessonWordsMode()`; `buildPlan()`, `buildQueue()`, `render()` (planMeta, settings sync).
- New handlers near l.755; `runTurn()` retry; `startSession()` (P0).
- `reveal()`, `found()`, `renderAnimals()`, `renderZoo()`, the zoo click handler.
- `resetS()`, the createChild defaults (l.1218), `settingsObj()`, `applySettings()`.
- `wipeDom()` gets `optWordsHint` and `optWordsNote`.

Must NOT change: `uat/`, root `index.html`, `family-buddy/`, `supabase/migrations/`, gift/turn row shapes, the storage keys, the `pics` range.

## Assumptions (decided by BA)

1. Words = distinct objects, Pictures stays the lesson length (Scrum Master's framing, adopted). Rule 3 (new ≤ min(2, N)) stays whenever there is anything heard to review; only then does the top-up add more new objects (SD-1, decided 2026-10-01 to honour Tom's floor of 3).
2. The default is a *following* recommendation (`"rec"`), not a frozen number, so it adapts when the parent changes pictures or languages. At the defaults it gives 3 (Tom's decision: never below 3).
3. Random range is 2–5 (Tom approved 2026-10-01). It may draw 2, below the recommendation floor; that is accepted, the floor applies only to the recommendation.
4. One reserved "new" slot per lesson while new objects exist, so progress never stalls on misses.
5. The retry rule protects planned pictures. When there is no room, the retry is skipped instead of cutting a planned word.
6. Families: an accessory plus a number, no mama/baby naming. The reveal silhouette shows the base emoji only.
7. Member numbering is deterministic across devices after sync (day, gift uuid, index). Only a number shown in a celebration can shift (e.g. #2 → #3) when two devices earned the same family offline on the same day. Cosmetic and accepted (architecture-wa §3).
8. Scope: one animal per finished lesson, nothing more.
9. When not all pairs fit, the least-needed languages of the last objects are left out, with the language tie order rotated per object. No per-lesson rotation: a left-out pair stays unheard and ranks first next time, which already rotates across lessons (AC-28).
10. The language fit note is hidden in `"rec"` mode, because leaving a few pairs out is the designed default, not a problem. It shows, in neutral words, only when the parent chose a fixed or Random size.
11. Gifts without a valid day are not shown or counted anywhere (SD-2); they could never sync, so counting them would make devices disagree.

## Open for Tom

None. Decided by Tom on 2026-10-01: recommendation floor of 3 (max stays 4), Random 2–5, the 12 accessories.

## Later (not this increment)

Choosing which animal comes next; animal sounds; "family complete" moments; naming an animal; a sticker-book view; Czech names (`cz`) for animals.

## For architect (all answered in `architecture-wa.md`; answers folded into R-W8, R-A2 and the edge tables)

1. Confirm there's no migration: `gifts.animal` only has a length check (≤32), and `children.settings` with `lessonWords` stays ≤4096 bytes (`pg_column_size`, jsonb) even with a full `off` list.
2. Old-client overwrite: an older cached build saves `settingsObj()` without `lessonWords`, and the server copy loses it. R-W8 keeps local values, but a freshly signed-in device then gets `"rec"`. Acceptable, or should the stub/Supabase save merge unknown keys server-side?
3. Member order across devices: `merge()` sorts `S.earned` by day only (stable). Is adding a `created_at` tie-break worth it (the pull already returns it but merge drops it), or is (day, index) enough?
4. Emoji rendering on the oldest supported Android Chrome: 🦩 and 🦥 (Emoji 12), 🐿️ with VS16, and accessory overlays inside `filter:brightness(0)` (the reveal uses only the base, but please confirm the `.shadow` span holds no `.acc`).
5. `dinnerWords()` now receives a pair list limited to N objects. Any objection, or should it keep the full unlimited plan?
6. Random seed: should k (gifts today) include gifts synced from other devices (as specified), or only local ones?

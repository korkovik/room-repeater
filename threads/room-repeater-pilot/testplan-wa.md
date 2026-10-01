# Test plan: Increment WA — "Words per lesson" + "Animal families"

QA phase 1, 2026-10-01, **revision 2** (same day). Reference: `spec-wa.md` as revised after Tom's answers (AC-1…AC-28, R-W1…R-W8, R-A1…R-A8).

**Revision 2 note (2026-10-01).** Re-derived to the revised spec: rec = `clamp(floor(pics/L),3,4)`, rotated language tie-break (object i starts at `langs()[i mod L]`), new fit-note rules (none in `"rec"`; neutral note with real pair count in fixed/Random), SD-1/2/3 resolved. Changed: #1, #2, #4, #5, #6, #7, #10, #12, #13, #14, #15, #17, #19, #20, #23, #27, #29, #31, #32, #36, #38, #40, #63. New: #84–#92 (AC-25…AC-28 plus four rule checks). Every expected queue was recomputed by QA with an independent reference model written from the spec text only (`scratchpad/qa/oracle.js`), not taken from the BA's list or the code. The model agrees with every value the spec itself states (R-W3 worked example, edge table, AC-10, AC-25, AC-28). Previous revision kept at `scratchpad/qa/testplan-wa.rev1.md`.

Original note (rev 1): derived from the spec plus the *current* `dev/index.html` (to know the existing IDs, hooks and storage keys), before any WA implementation exists. Aligned with `architecture-wa.md` (arrived during writing): its SPEC CHANGEs (R-W8 self-heal, AC-13 extension, R-A2 tie-break by gift id, edge `{}` not queued) are treated as part of the spec, and its checks X-1…X-4 are scenarios 79–82.

Totals: **92 scenarios**: 57 words (1–47, 79, 84–92), 27 animals (48–70, 80–83), 8 regression (71–78). One (#82) is manual on a real Android device. Spec defects SD-1…SD-3 are resolved in the spec (see the end); no open spec defects.

---

## 0. Harness (phase 2)

**Server and browser.** Run `python3 -m http.server 8765` from the repo root. The app is at `http://localhost:8765/dev/`. Playwright **1.56.1 is now installed** by the developer in the session scratchpad `pw/node_modules` (package.json `playwright ^1.56.1`), with browsers in `~/Library/Caches/ms-playwright` (`chromium-1194`, `chromium_headless_shell-1194`), checked 2026-10-01. The developer launches `chromium.launch()` headless against `http://localhost:8765/dev/`. Phase 2 reuses only that install (`NODE_PATH=<scratchpad>/pw/node_modules`). QA's scripts are its own, in `<scratchpad>/qa/`, and do not import the developer's `pw/lib.js`, `legacy.js` or `stub.js`. Nothing is installed into `family-buddy/`. Expected queues come from `<scratchpad>/qa/oracle.js`. Before running, confirm the `dev/index.html` hash differs from `681a82765da0cff0`: that build predates the 2026-10-01 spec revision (its `wordsRec()` still uses the old formula per `dev-notes-wa.md`).

**Clock.** `today()` is UTC (`toISOString().slice(0,10)`), so every test fixes the clock with `page.clock.install({time: new Date('2026-10-01T09:00:00Z')})`. Then use `page.clock.runFor(ms)` to get past the app's waits: 150 ms stub latency, the 2.5 s reveal/party tap gates, the 2 s outbox debounce and the 1.5 s hold-to-stop. Do **not** use `setFixedTime`. It freezes `Date.now()`, so the 2.5 s gates never open.

**Speech stub** (`addInitScript`, every test). It makes sessions fast and records what was spoken:
```js
window.__spoken=[];
HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('x','NotAllowedError'));};
window.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speaking:false,pending:false,cancel(){},getVoices(){return [];},
  speak(u){window.__spoken.push({text:u.text,lang:u.lang});setTimeout(()=>{u.onstart&&u.onstart();u.onend&&u.onend();},0);}}});
delete window.SpeechRecognition; delete window.webkitSpeechRecognition;   // forces parent-confirm (👏/🤫)
```
Collect `pageerror` and `console.error` on every page. Any of them, or `#asrNote` starting with "Error:", fails the scenario.

**Playing a lesson (helper `play(page, answers)`).** Steps:
1. Click `#startBtn`.
2. Each turn: click `#card`, then wait for `#confirm.on`, then click `#yesBtn` (said) or `#noBtn` (missed).
3. When `#reveal` is visible (halfway), record `#card .shadow` innerHTML, `runFor(2600)`, then click `#card`.
4. At the end, `#party.on` appears. Record `#partyArt` innerHTML, `#partyText` text and `#partyShelf` innerHTML, then `runFor(2600)` and click `#party`.
5. The order played is read from the log afterwards: legacy `localStorage['rr-pilot-v1-dev'].log`, account `localStorage['rr-acct-dev'].log`.

**Legacy seed** (`?backend=off`): goto `/dev/?backend=off`, `localStorage.setItem('rr-pilot-v1-dev', JSON.stringify(state))`, reload. State shape: `{v:2, log:[{day,ts,obj,lang,result,judge}], dropped:[], earned:[{id,day}], settings:{en:true,de:true,es:true,pics:8,parent:true}}`. `v:2` is required, otherwise the old 12→8 pictures migration runs.

Named seeds:
- **H8** = 24 turns on `2026-09-28`, `result:'said'`, `judge:'parent'`, for objects `dog, cat, ball, apple, car, shoe, sun, house` × `en, de, es`. Effect: 8 heard objects, last heard 3 days ago (not a miss, not stale). The first new objects are `book`, `spoon`, `cup`, `banana`. H8 keeps "max 2 new" (rule 3) and R-W2 step 5 from conflicting for N ≤ 8 (see SD-1).
- **G13** = `earned`: rabbit, duck, elephant, giraffe, turtle, penguin, owl, snail, butterfly, octopus, flamingo, camel, rabbit with days `2026-09-18` … `2026-09-30` (one per day, in that order).
- **G41** = all 40 roster ids once (days 2026-08-01 … 2026-09-09, roster order), then rabbit on 2026-09-10.

**Account (stub) setup** (`?backend=stub`):
1. Fill `[data-testid=signin-email]` with `parent1@example.test`, then click `[data-testid=signin-send]`.
2. Fill `[data-testid=code-input]` with `123456`, then click `[data-testid=code-submit]`.
3. Check `[data-testid=terms-accept]`, then click `[data-testid=terms-continue]`.
4. Fill `[data-testid=child-nickname]` with `Mia` (all 3 languages), then click `[data-testid=child-save]`. Today shows.

Hooks: `RR_SYNC.flush()`, `RR_SYNC.pull()`, `RR_SYNC.status()`, `RR_BACKEND._stub.exportDb()` / `.importDb(json)`.

**Second phone (B):** a new browser context. Seed `rr-stub-db-dev` with A's `exportDb()` before the first load, then sign in the same way. Onboarding finds the existing profile and child. To sync later, call `importDb(A's latest export)` on B, then `RR_SYNC.pull()`. The same works in the other direction.

**QA hooks expected from the spec:**
- `window.RR_LESSON = {mode(), target(), n(), rec(), queue()}`, where `queue()` returns `[{obj,lang}]`.
- `window.RR_ANIMALS = {roster(), next(), counts()}`.

A missing hook = BLOCKED for the hook part and a defect against the "Data & interfaces" section.

**Expected-queue notation:** `book-en` = `{obj:'book',lang:'en'}`. `~Z min` = `max(1, round(P/2))`: 8→4, 12→6, 6→3, 9→5.

**Rotation shorthand (R-W2).** With en/de/es active, ties inside object *i* (0-based slot) are broken in the order starting at `i mod 3`: slot 0 en,de,es; slot 1 de,es,en; slot 2 es,en,de; slot 3 en,de,es … With 2 languages (en, de): even slots en,de, odd slots de,en. H8 objects tie inside each need class (all new, or all reviewed on the same day), so their first language is pure rotation.

---

## 1. Words per lesson

### 1a. Default, recommendation, bounds (R-W1, R-W7)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 1 | Default for a fresh legacy user | Legacy, empty storage (8 pictures, en/de/es). Open Settings. | `#optWords` (`words-per-lesson`) value `3`, not disabled. `words-hint` text = "Recommended for her: 3. A few words heard often tend to stick better for toddlers." `#optWordsRandom` unchecked. `words-rec` not visible. `words-note` text empty. `RR_LESSON.mode()` = `"rec"`, `rec()` = 3, `target()` = 3. | AC-1 *(rev 2)* |
| 2 | Default for an existing user without the key | Legacy seed H8, settings without `lessonWords`. Open Settings. | Same as #1 (value 3, rec hint with 3, switch off, note empty). Storage loads and nothing errors. | AC-1, R-W1 *(rev 2)* |
| 3 | Settings row placement and attributes | Settings DOM | The new row is in the "Session" `.group` **before** the row containing `#optPics`. The Random switch row comes after it. `#optWords` has type=number, min=2, max=8. `#wordsMinus` aria-label "Fewer words", `#wordsPlus` aria-label "More words". The label text "Words per lesson" is present. The Random row label is "Random each lesson", small "2–5 words, changes after each finished lesson". | R-W7 |
| 4 | Recommendation table | Legacy, rec mode. Set pictures/languages, then read `RR_LESSON.rec()` and `#optWords`: 6/3, 8/3, 9/3, 11/3, 12/3 (all 3 langs); 6/2, 7/2, 8/2 (ES off); 6/1, 8/1 (DE+ES off) | 3, 3, 3, 3, 4; 3, 3, 4; 4, 4. The input shows the same value (mode rec). Never below 3, never above 4. (QA-computed; matches the spec table, plus 7/2 added as the L=2 boundary.) | R-W1 def. rec *(rev 2)* |
| 5 | rec follows a language change | H8, rec mode, 8 pics (shows 3). Uncheck `#optEs`. | Without reload: `#optWords` = 4. Hint "Recommended for her: 4. …". Today `#planTitle` = "4 friends, 2 languages". `#planMeta` contains "4 words · 8 pictures · ~4 min". `queue()` = book-en, spoon-de, dog-en, cat-de, book-de, spoon-en, dog-de, cat-en (2-language rotation). `words-note` empty (rec mode; pairs 8 = pics anyway). | R-W6, R-W2 rotation, edge "Languages switched" *(rev 2)* |
| 6 | + from rec | H8, rec (shows 3). Click `#wordsPlus` once. | Input 4. `mode()` = 4 (number). Hint starts "Recommended: 3". `words-rec` visible with text "Use recommended". Stored `settings.lessonWords` = 4 in `rr-pilot-v1-dev`. | R-W7 *(rev 2)* |
| 7 | Upper bound | H8, rec (shows 3). Click + 6 times. | Values 4, 5, 6, 7, 8, 8. It never exceeds 8. Mode is fixed (number) after the first click. | R-W7 bounds *(rev 2)* |
| 8 | Lower bound | From 8, click − 7 times. | Down to 2, and it stays 2 (fixed mode 2, not "rec"). | R-W7 bounds |
| 9 | Typed values | Fill `#optWords` with `5` and dispatch change. Then `0`, `9`, `3.6`. | 5, 2, 8, 4. The mode is fixed each time. | R-W7 |
| 10 | Typed non-number | From fixed 5: fill `#optWords` with an empty value and dispatch change. Again from fixed 5 with `abc` (via `el.value='abc'` + change event, since a number input may reject typing letters). | Both times: mode `"rec"`, input shows 3 (rec at 8/3), hint is the rec hint, `words-rec` hidden. | R-W7 (SD-3 resolved) *(rev 2)* |
| 11 | Persistence across reload | Set 5 and reload. | Input 5, `mode()` 5. | R-W1 |
| 12 | Corrupt stored values | Legacy storage `settings.lessonWords` = `"abc"`, then `99`, `1`, `3.6`, `null`, `""`, `true`, `"5"`, `"random"`, `"rec"` (reload each time) | `mode()` = `"rec"`, 8, 2, 4, `"rec"`, `"rec"`, `"rec"`, 5, `"random"`, `"rec"`. No pageerror. Today renders a title. | AC-11, R-W1 edge *(rev 2: added `""`, `true`, `"5"`)* |

### 1b. Plan and queue (R-W2, R-W3, R-W6)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 13 | Fixed 4, 12 pictures: Today card | H8. Settings: + once (3→4). picsPlus ×4 (8→12). Open Today. | `#planTitle` = "4 friends, 3 languages". `#planMeta` has `data-testid="plan-meta"` and text "4 words · 12 pictures · ~6 min". `RR_LESSON.queue()` = book-en, spoon-de, dog-es, cat-en, book-de, spoon-es, dog-en, cat-de, book-es, spoon-en, dog-de, cat-es (12 items, exactly 4 distinct objects, all 12 pairs). `RR_LESSON.n()` = 4. | AC-2, R-W2 rotation, R-W3 *(rev 2)* |
| 14 | planList shows first 3 + more | State of #13 | `#planList` has 3 `.prow` rows, then "+ 1 more". Rows and tag order (from the capped queue): 📖 book EN, DE, ES; 🥄 spoon DE, ES, EN; 🐶 dog ES, EN, DE. | R-W6 *(rev 2: tag order follows the rotation)* |
| 15 | Fit note: languages (fixed) | H8, fixed 4, pictures 8, 3 langs. Open Settings. | `words-note` = "Every word comes up at least once. A few languages wait for the next lesson; 12 pictures fit them all." After pics → 12: note empty. (Same as AC-27; see #87 for boundaries.) | R-W7 rule 3, AC-27 *(rev 2: new wording)* |
| 16 | Session = preview | State of #13. Save `queue()`. `play()` all said (12 turns). | Log of today = 12 turns, same `(obj,lang)` sequence as the saved queue. Object set {book, spoon, dog, cat}. Every previewed pair played. Party shows. | AC-3 |
| 17 | Preview equals session for rec | H8, rec (3), 8 pics. Save `queue()`, then play all said. | Expected queue: book-en, spoon-de, dog-es, book-de, spoon-es, dog-en, book-es, spoon-en (all first-pass, none `why:'review'`; dog-de left out). Played order is identical. | R-W3 *(rev 2)* |
| 18 | Max 2 new (seeded) | H8, fixed 5, 8 pics | Objects in slot order: book, spoon (new), dog, cat, ball (review). Exactly 2 of the 5 have an unheard pair. | AC-5 |
| 19 | Top-up for a fresh child | Legacy, empty storage, fixed 5, 8 pics | `n()` = 5. Objects in slot order dog, cat, ball, apple, car (all unheard, `activeWords()` order: 2 from step 3, 3 from the step-5 top-up). `queue()` = dog-en, cat-de, ball-es, apple-en, car-de, dog-de, cat-es, ball-en. Title "5 friends, 3 languages". | AC-5(b) (SD-1 resolved) *(rev 2)* |
| 20 | Reservation (misses) | H8 plus yesterday `2026-09-30` turns `missed` for dog and cat × en, de, es. Fixed 2. | `queue()` objects in order: dog (miss), book (new). Queue = dog-en, book-de, dog-de, book-es, dog-es, book-en, dog-en, book-de (last 2 `why:'review'`). Exactly 1 miss slot and 1 new slot; cat is not in the lesson. | AC-6 *(rev 2: rotation)* |
| 21 | Reservation (stale) | H8, but dog and cat turns dated `2026-09-20` (≥4 days). Fixed 2. | Objects: dog (stale), book (new). | R-W2 step 2 + reservation |
| 22 | Review oldest first, today last | H8 with cat's turns moved to `2026-09-25` and dog's to `2026-10-01` (today). Fixed 4. | Objects: book, spoon, cat (oldest review), ball. Dog is not chosen (heard today). | R-W2 step 4 |
| 23 | Play again gets different objects | H8, rec (3). Play a lesson all said (queue of #17). Back on Today. | `#startBtn` "Play again". Preview objects = cup, banana (new), cat (oldest review); not book/spoon/dog (heard today). `queue()` = cup-en, banana-de, cat-es, cup-de, banana-es, cat-en, cup-es, banana-en. `plan-meta` = "8 turns today · 8 said back · 3 words · 8 pictures · ~4 min". | R-W2 step 4, R-W6 *(rev 2)* |
| 24 | Small pool, account | Stub account, fresh child. Words → Choose → `bw-all-off`, then tick `bw-toggle` for dog. Settings: fixed 4. | Today `#planTitle` = "1 friend, 3 languages". `plan-meta` = "1 word · 8 pictures · ~4 min" (singular "word"). `n()` = 1. No fit note. | AC-7 |
| 25 | Small pool, legacy | Legacy, `dropped` = every `obj|lang` key except dog's 3 (180 keys). Fixed 4. | Same title and meta as #24. | AC-7, edge "all dropped" |
| 26 | Empty pool unchanged | Stub, `bw-all-off` | `#planMeta` text "No words switched on. Open Words → Choose to switch some on." `data-testid="plan-empty"` (not plan-meta). `#startBtn` disabled. | Edge R17 |
| 27 | Fit note: too many words | H8, pictures 6 (picsMinus ×2), fixed 8 | `#optWords` = 8. `words-note` = "Only 6 words fit in 6 pictures." (rule 1 wins over the language note although pairs 18 > 6). Today: `#planTitle` = "6 friends, 3 languages". `queue()` = book-en, spoon-de, dog-es, cat-en, ball-de, apple-es (each object once, first languages rotate en, de, es, en, de, es). `plan-meta` "6 words · 6 pictures · ~3 min". `n()` 6. | AC-8, R-W7 rule 1 *(rev 2: title was "1 language")* |
| 28 | Own word, DE only | Stub, fixed 2. Add own word DE "Kreisel" (EN/ES optional after unticking EN+ES). Active: DE only. `bw-all-off`. | The own word is eligible. Its queue items are all `lang:'de'`. | Edge "own word DE" |
| 29 | Use recommended | H8, fixed 6, 8 pics, 3 langs. Click `words-rec`. | `mode()` = "rec". Input 3. Hint "Recommended for her: 3. …". `words-rec` hidden. `words-note` empty (it showed the gentle note at fixed 6: 18 pairs > 8). Today "3 friends, 3 languages", meta "3 words · 8 pictures · ~4 min". | AC-10 *(rev 2)* |
| 30 | Re-render on every change | Watch `#planMeta` while doing + in Settings, picsPlus, unchecking DE | `#planMeta` changes after each action without reload or tab switch (read the text immediately after each click). | R-W6 |

### 1c. Retry may not cut (R-W5)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 31 | Miss first picture, full lesson | H8, fixed 8, 8 pics. Save `queue()` = book-en, spoon-de, dog-es, cat-en, ball-de, apple-es, car-en, shoe-de. `play()`: turn 1 🤫 missed, rest 👏. | 8 turns logged, in exactly the saved order; 8 distinct objects = the saved set. Turn 1 `missed`, no object twice. The party shows (lesson completed). | AC-4 *(rev 2: rotated queue)* |
| 32 | Retry still happens when there is room | H8, **fixed 2**, 8 pics (6 distinct pairs + 2 review pictures). Save `queue()` = book-en, spoon-de, book-de, spoon-es, book-es, spoon-en, book-en, spoon-de. Turn 1 missed (book-en), rest said. | 8 turns logged. book-en is played again after the miss with result `said` (retry accepted). All 6 P0 pairs (book/spoon × en, de, es) are played. Expected sequence with the existing insert-at-index-3 rule: book-en (missed), spoon-de, book-de, spoon-es, book-en, book-es, spoon-en, book-en. The first three assertions are the pass criteria; the exact sequence is recorded. | R-W5 positive, regression *(rev 2: rec is now 3, which leaves no room, so this uses fixed 2; see #92)* |

### 1d. Random (R-W4)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 33 | Test vectors | Random on. Clock 2026-10-01: `earned` with 0, then 1, then 2 entries dated 2026-10-01 (reload). Then clock 2026-10-02 with 0. | `RR_LESSON.target()` = 3, 4, 5, 2. These match FNV-1a 32 computed independently by QA in node: `2026-10-01\|0`=0xdcc0da99→3, `\|1`=0xdbc0d906→4, `\|2`=0xdac0d773→5, `2026-10-02\|0`=0xa1221c48→2. | R-W4 def |
| 34 | Gifts from other days don't count | Clock 2026-10-01, G13 (all before today), Random | `target()` = 3 (k=0). | Def "Lesson index k" |
| 35 | Random UI | H8, check `#optWordsRandom` | `mode()` "random". `#optWords` = 3 and disabled. `#wordsMinus` and `#wordsPlus` disabled. Hint "Random each lesson: 2–5 words." Stored `lessonWords` = "random". | R-W7 |
| 36 | Random end to end | H8, Random, 2026-10-01, 0 lessons today. Today, then `play()` all said, then Today again. | Before: `plan-meta` "3 words (random) · 8 pictures · ~4 min", title "3 friends, 3 languages", `queue()` = the #17 queue; played sequence equals it (objects book, spoon, dog). After: meta contains "4 words (random)", `#optWords` shows 4 (disabled), `queue()` = cup-en, banana-de, cat-es, ball-en, cup-de, banana-es, cat-en, ball-de. | AC-9 *(rev 2: exact queues)* |
| 37 | Unfinished lesson keeps the draw | H8, Random. Start, play 2 turns, hold `#stop` 1.6 s. | Back on Today: still "3 words (random)" (k unchanged, no gift). | R-W4 |
| 38 | Unchecking Random gives rec | From #35, uncheck | `mode()` "rec", input and both buttons enabled, input shows 3, rec hint, `words-note` empty. | R-W7 *(rev 2)* |
| 39 | Fixed mode never shows "(random)" | Fixed 4 | `plan-meta` has no "(random)". | R-W6 |

### 1e. Account mode and sync (R-W1, R-W8)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 40 | New child default on the server | Stub, onboard a fresh child (3 languages, 8 pics). `exportDb()`. | `children[uid].settings.lessonWords` = "rec". Settings shows 3, hint "Recommended for her: 3. …", `words-note` empty. Today "3 friends, 3 languages". | R-W1 (createChild), AC-1 *(rev 2)* |
| 41 | Round trip A→B, then B→A | A: set fixed 5, `runFor(2100)`, `flush()`. Server settings `lessonWords` = 5. B (seeded from A's DB, signed in) → `#optWords` = 5, `RR_LESSON.target()` 5. B: check Random, flush, export. A: `importDb`, `pull()`. | A: `#optWordsRandom` checked, `mode()` "random", `plan-meta` contains "(random)". Status shows no error (`RR_SYNC.status().lastErr` null). | AC-12 |
| 42 | Old client: key missing on server | A at fixed 5 and synced. Edit A's stub DB: delete `settings.lessonWords`, set `settings.pics`=10, `settings_updated_at` = now+60 s. `importDb`, `pull()`. Then `runFor(2100)`, `flush()`, `exportDb()`. | A: pics becomes 10 (the pull was applied), and `mode()` stays 5. After the flush the server `settings` = `{…pics:10…, lessonWords:5}` (self-heal). | AC-13 (+arch §2 extension), R-W8 |
| 43 | Fresh device, server without key | B in a new context, seeded with the DB from #42, signs in | `mode()` "rec". | Edge "old client" |
| 44 | Size limit | Stub: `bw-all-off` (all 61 ids in `off`). Random on. Pics 30. `runFor(2100)`, `flush()`. | `RR_SYNC.status()`: outbox 0, lastErr null. Server `settings.off.length` = 61, `lessonWords` "random". `JSON.stringify(settings).length` ≤ 4096 (the architect measured 558 chars). | AC-14 |
| 45 | Pilot import carries the key | Stub context. Before load, set `rr-pilot-v1-dev` = G13 + H8 log + `settings.lessonWords:6`. Sign in a fresh child. Click `import-yes`. | `import-msg` "Imported: 24 turns, 13 animals." `mode()` 6, input 6. After flush, the server has `lessonWords` 6. | R-W1 (doImport) |
| 46 | Random k counts synced gifts | B in Random mode, 0 lessons today: meta "3 words (random)". A (same child) finishes a lesson today and flushes. B: `importDb`, `pull()`. | B: meta changes to "4 words (random)" without user action, and B's next session plays 4 objects. | Edge "Random synced gift", R-W4 |
| 79 | Self-heal is not triggered in rec mode | Like #42, but A is on "rec". After the pull, check `RR_SYNC.status().outbox`. | outbox 0: no settings entry queued. The server row stays without `lessonWords`. A shows `mode()` "rec". | arch X-1 |
| 47 | Sign out clears the new elements | Stub, fixed 6 (hint and note filled), sign out | `#optWordsHint` and `#optWordsNote` text empty on the sign-in screen. | Affected code (wipeDom) |

### 1f. Revision 2 additions: default lesson, fit note, rotation (AC-25…AC-28)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 84 | Default lesson preview | Legacy, empty storage (8 pics, en/de/es, `"rec"`). Today. | `#planTitle` "3 friends, 3 languages". `plan-meta` "3 words · 8 pictures · ~4 min". `RR_LESSON.queue()` = dog-en, cat-de, ball-es, dog-de, cat-es, ball-en, dog-es, cat-en (8 items; ball-de left out). Counts: dog 3, cat 3, ball 2 (each word ≥1×); EN 3, DE 2, ES 3 (each language ≥2×). `#planList`: 🐶 dog EN, DE, ES; 🐱 cat DE, ES, EN; ⚽ ball ES, EN (two tags only), no "+ more". The Today card has no note about left-out languages (no text containing "wait" or "fit"). | AC-25, R-W3 worked example, R-W6 |
| 85 | Default lesson plays as previewed | State #84. Save `queue()`, `play()` all said. | 8 turns logged in exactly the saved order. Party shows; gift rabbit. | AC-25, AC-3 pattern |
| 86 | No note in rec mode | Legacy, rec. (a) 8 pics / 3 langs (9 pairs > 8). (b) picsMinus ×2 → 6 pics. (c) H8 at 8 pics/3 langs. | `words-note` text empty in (a), (b), (c). In (b): `rec()` 3, `queue()` = dog-en, cat-de, ball-es, dog-de, cat-es, ball-en (each word twice, in 2 languages), title "3 friends, 3 languages", meta "3 words · 6 pictures · ~3 min". | AC-26, R-W7 rule 2 |
| 87 | Gentle note, fixed mode, with boundaries | H8, 3 langs. (a) fixed 4, 8 pics. (b) pics → 12. (c) fixed 3, pics 8. (d) fixed 3, pics 9. (e) fixed 2, pics 8. | (a) `words-note` exactly "Every word comes up at least once. A few languages wait for the next lesson; 12 pictures fit them all." (b) empty. (c) same sentence with "9 pictures". (d) empty (9 pairs = 9 pictures, rule is strictly ">"); `queue()` = book-en, spoon-de, dog-es, book-de, spoon-es, dog-en, book-es, spoon-en, dog-de. (e) empty (6 pairs). The note text never contains "only" or "not". | AC-27, R-W7 rule 3/4 |
| 88 | Gentle note in Random mode | H8, Random, clock 2026-10-01. (a) 0 gifts today (draw 3). (b) `earned` = 2 entries `{id:'rabbit',day:'2026-10-01'}`, `{id:'duck',day:'2026-10-01'}` (draw 5), reload. | (a) `target()` 3, note "…; 9 pictures fit them all." (b) `target()` 5, `n()` 5, note "…; 15 pictures fit them all.", `queue()` = book-en, spoon-de, dog-es, cat-en, ball-de, book-de, spoon-es, dog-en (words 1–3 twice, 4–5 once), meta contains "5 words (random)". | R-W7 rule 3, edge "Random draw 5" |
| 89 | Left-out language comes back next lesson | State #85 (default lesson finished, all said). Today again. | `#startBtn` "Play again". Lesson objects ball, apple (new), dog (review, heard today; cat also heard today but comes later). `queue()` = ball-de, apple-de, dog-es, ball-en, apple-es, dog-en, ball-es, apple-en (starts with ball-de). `plan-meta` "8 turns today · 8 said back · 3 words · 8 pictures · ~4 min". `#planList` first row ⚽ ball DE, EN, ES. | AC-28, R-W3 "Across lessons" |
| 90 | Fit note counts real pairs (own word) | Stub, fresh child, 3 langs. Add own word "Kreisel" with a DE text only (as #28). `bw-all-off`, then `bw-toggle` on for dog and cat. Fixed 3. (a) pics 6. (b) pics 7. | Pool order Kreisel, dog, cat (own words first). (a) pairs = 1+3+3 = 7 > 6: note "…; 7 pictures fit them all." (not 9). `queue()` objects: Kreisel ×2 (both `de`), dog-de, dog-es, cat-es, cat-en (order: Kreisel-de, dog-de, cat-es, Kreisel-de, dog-es, cat-en). (b) note empty. | R-W7 "pairs = Σ len_i", edge "Own word DE only" |
| 91 | One heard object, fixed 5 | Legacy. Log: dog × en/de/es `said` on 2026-09-28 only. Fixed 5, 8 pics. | Slot order cat, ball (step 3 new), dog (step 4 review), apple, car (step 5 top-up). `n()` 5. `queue()` = cat-en, ball-de, dog-es, apple-en, car-de, cat-de, ball-es, dog-en. | Edge "1 heard object", R-W2 step 5 |
| 92 | No retry at the default (no room) | Legacy, empty storage, rec (3), 8 pics. Save `queue()` (#84). `play()`: turn 1 missed (dog-en), rest said. | 8 turns logged in exactly the saved order; dog-en appears once (missed) and is not retried; all 8 planned pairs played; party shows. Reason: all 8 pictures are distinct planned pairs, so any re-insert would push one out (R-W5). | R-W5, AC-4 pattern |

## 2. Animal families

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 48 | Roster | `RR_ANIMALS.roster()` | 40 entries. Ids in the exact order of the spec table (rabbit … parrot). First 12 equal today's ids, emoji and names. Every id ≤ 32 chars. Every entry has `e, en, de, es`. Spot checks: #23 squirrel `e` = "🐿️" (U+1F43F U+FE0F); #11 flamingo 🦩; #32 sloth 🦥. | R-A1 |
| 49 | Empty history | Legacy, no gifts | `next()` → rabbit. `#animalsCount` "0 friends". `#animalsMeta` "Finish today's session to meet the first one." `#zooMeta` "Finish a session to meet the first one." `#zooGrid`: 1 `[data-state=next]` tile (rabbit silhouette) + 39 `.tile.later`. `#friendRow`: `?` + 4 empty slots. | R-A3, R-A6, R-A7 |
| 50 | First gift, played | H8, no gifts, rec. `play()` all said. | Reveal `#card .shadow` = 🐇 with no `.acc`. `#partyText` "Rabbit is here!". `#partyArt` 🐇 with no `.acc`. Stored `earned` = `[{id:'rabbit',day:'2026-10-01'}]`. Spoken (`__spoken`) includes "rabbit", "Hase", "conejo". `#animalsCount` "1 friend". `#animalsMeta` "1 family · someone new comes after the next session." | R-A4, R-A6 |
| 51 | Old cycle continuity, 5 gifts | Gifts rabbit…turtle | `next()` penguin. Grid: 5 earned tiles (no `×`), then the penguin next tile, then 34 eggs. | R-A3 ex. |
| 52 | 13th → cat (continuity) | H8 + G13. `play()` all said. | Before: `next()` cat. Reveal `#card .shadow` = 🐈. `#partyText` "Cat is here!". `#partyArt` 🐈. New stored entry `{id:'cat',day:'2026-10-01'}` (base id only, no number field). | AC-15 |
| 53 | Totals for 13 gifts | H8 + G13 (no play) | `#animalsCount` "13 friends". `#animalsMeta` "12 families · someone new comes after the next session." Animals tab `#zooMeta` "13 friends · 12 families · tap one to hear its name". `counts()` = rabbit 2, the 11 others 1. | AC-19 |
| 54 | Zoo grid for 13 gifts | H8 + G13, Animals tab | `#zooGrid` children in order: 12 `button.tile[data-state=earned]` (rabbit…camel, roster order). Rabbit has `data-count="2"` and visible "×2". The others have `data-count="1"` and no "×". Then 1 `[data-state=next][data-animal=cat]` with `.shadow` 🐈. Then 27 `.tile.later`. Total 40. | AC-20 |
| 55 | Family strip | State #54. Click the rabbit tile. | `[data-testid=zoo-family]` has 2 `.mem`. `data-member="1"`: 🐇, no `.acc`, no `.num`. `data-member="2"`: 🐇 + `.acc` 🎀 + `.num` "2". `#zooSay` contains "EN rabbit · DE Hase · ES conejo". `__spoken` gets rabbit/Hase/conejo. | AC-21, R-A8 |
| 56 | Next tile unchanged | Click the cat (next) tile | `#zooSay` "Who's coming? Finish a session to find out." Spoken "Who's coming?". | R-A7 |
| 57 | friendRow with 13 | State #53 | `#friendRow`: 4 `.mem` (octopus, flamingo, camel, rabbit with `data-member=2` + 🎀), then 1 `?` slot, 5 slots total. | R-A6 |
| 58 | Second member of the next family | Legacy G41, H8. `play()` all said. | Before: `next()` duck. Reveal silhouette 🦆 with **no** 🎀 in `#card .shadow`. `#partyArt` `.mem[data-member=2]` 🦆 + `.acc` 🎀 (no `.num`). `#partyText` "A second duck joined the duck family!". `#partyShelf` 2 members, the 2nd inside `span.new`. Stored `{id:'duck',day:'2026-10-01'}`. | AC-16, R-A5 |
| 59 | Ordinal cap (11th) | Legacy seed: each of the first 12 roster animals ×11, cat ×10, animals #14–#40 ×10. Days ascending, all before today. 412 gifts. `play()`. | `next()` cat beforehand. `#partyText` "Cat number 11 joined the cat family!". `#partyArt` 🐈 + `.acc` 👓 (ACC[9]). `#partyShelf` begins "+3", shows the last 8 members, the new one in `span.new`. | AC-17, R-A4 |
| 60 | Ordinal words 2…10 | Seeds where next = cat with k-1 members, for k = 3, 10 (same pattern as #59). Check `partyText` only. | k=3 "A third cat joined the cat family!". k=10 "A tenth cat joined the cat family!". | R-A4 |
| 61 | 100 lessons never run out (simulated) | Legacy, empty. Loop 100×: `a=next()`, append `{id:a.id, day}` (days 2026-06-01+i), reload. Record (id, member#). | Each consecutive (id, member) pair differs. Final `counts()`: 40 keys, 20 with 3 (rabbit…chick, #1–#20), 20 with 2. `next()` = mouse (#21, would be 3rd). No pageerror. `zooMeta` "100 friends · 40 families · tap one to hear its name". Grid: 40 earned + 1 next (mouse) + 0 eggs. | AC-18 |
| 62 | 100 lessons: real sessions confirm the rule | From the end of #61 (+H8), play 3 real lessons (rec, all said) | Gifts: mouse, hedgehog, squirrel, each with member 3. `#partyText` "A third mouse joined the mouse family!" etc. | AC-18, R-A3 |
| 63 | Unknown / malformed entries, legacy | `earned` = G13 + `{id:'unicorn',day:'2026-09-30'}` + `{}` + `{day:'2026-09-29'}` + `{id:'cat'}` + `{id:'cat',day:''}` | No pageerror. Totals identical to #53 ("13 friends", "12 families", zooMeta "13 friends · 12 families · …"). `counts()` has no `cat` and no `unicorn`. `next()` = cat (the two undated cats do not count, SD-2). Grid: cat is the `next` tile, not an earned tile. Storage still holds all 18 entries after a save (e.g. toggle a setting). | R-A2 (SD-2 resolved), edge `{}` row *(rev 2)* |
| 64 | Unknown id from the server | Stub A, synced. Inject into the stub DB a gift `{id:<uuid>,child_id,day:'2026-09-30',animal:'unicorn',created_at:<now>}`. `importDb`, `pull()`. | No error. `counts()` has no unicorn. `animalsCount` unchanged. `rr-acct-dev` `earned` contains the unicorn row. A later `flush()` has no error (row not re-pushed). | AC-23 |
| 65 | Account gift shape and sync | Stub A (H8-like play history not needed: rec on a fresh child). `play()` all said. `runFor(2100)`, `flush()`. | Server `gifts` row = `{id:<uuid>, child_id, day:'2026-10-01', animal:'rabbit', created_at}`. No member field. B (seeded from DB) shows `counts()` {rabbit:1} and the same `animalsCount` "1 friend". | AC-22 |
| 66 | Second gift on B goes to the next family | Continue #65: B plays a lesson, flushes. A imports and pulls. | B's gift = duck. A `counts()` {rabbit:1, duck:1}, "2 friends". | AC-22, R-A3 |
| 67 | Import of 13 legacy gifts | Stub fresh child + pilot key G13. `import-yes`. | "Imported: 0 turns, 13 animals." (or the turn count if seeded). Then AC-19 totals: "13 friends", "12 families · …", zooMeta "13 friends · 12 families · tap one to hear its name". `next()` cat. | AC-24 |
| 68 | Same-day same-family on two devices | A and B offline (`context.setOffline(true)`), same child, both at 13 gifts (next = cat). Each plays a lesson. Both go online, flush, exchange DB, pull. A third context C signs in fresh from the final DB. | Both keep 2 cat gifts (different uuids). `counts().cat` = 2. No error. Tapping the cat tile on A, B and C gives the same `zoo-family`: member 1 = the cat gift with the smaller `String(id)` on all three (tie-break per arch §3). | Edge "two devices", arch X-2 |
| 80 | Malformed gift does not block the outbox (account) | Stub A, synced. Inject `{}` and `{animal:'cat'}` (no day) into `rr-acct-dev` `earned`, reload. `play()` all said. `runFor(2100)`, `flush()`. | `RR_SYNC.status()`: outbox 0, lastErr null. The new turns and the new gift are on the stub server. The malformed entries are still in local `earned` and are not on the server. No pageerror. | arch X-3, edge `{}` |
| 81 | Random k counts every valid today-gift | Legacy, Random, clock 2026-10-01, `earned` = `[{id:'unicorn',day:'2026-10-01'}]` | `target()` = 4 (k=1, the unknown id counts). Same with `{id:'rabbit'}` (no day): `target()` = 3 (skipped). | arch §6 |
| 82 | Emoji on Android 10+ Chrome (manual) | Real phone or an API 29 emulator. Open /dev/ in Animals with seed #61 (all 40) and #59 (accessories 2–13). | 🦩 (#11), 🐿️ (#23) and 🦥 (#32) render as emoji. All 12 accessories render. No tofu boxes. The reveal silhouette is solid black without an accessory. Headless fallback: assert `roster()[22].e` === "\u{1F43F}\uFE0F" and that no `.acc` is inside any `.shadow`. Mark the device part BLOCKED unless a device is available; it goes to Tom's UAT note. | arch X-4, R-A5 |
| 83 | Silhouettes never contain member markup | States #54 and #58: zoo next tile, and reveal during a session | `.shadow .mem`, `.shadow .acc` and `.shadow .num` match 0 elements. | arch §4, R-A5 |
| 69 | Removed strings | `grep -c "is here again\|that's all" dev/index.html` | 0. | R-A4 |
| 70 | Accessories do not change tile size | State #54: compare the bounding box of the rabbit tile (×2) with the duck tile (×1) | Same width and height (±1 px). | R-A8 CSS |

## 3. Regression (previous design must not change)

| # | Scenario | Steps / input | Expected result | Spec ref |
|---|---|---|---|---|
| 71 | All existing IDs present | Parse `dev/index.html` (static HTML) and the DOM after load | Every id in Appendix A is still present. New ids `wordsMinus, optWords, wordsPlus, optWordsHint, wordsRec, optWordsRandom, optWordsNote` are present. | Sprint pt. 4, spec "New IDs" |
| 72 | All existing data-testids present | Same, plus runtime testids (`cw-row, cw-toggle, cw-delete, cw-emoji, bw-row, bw-toggle, plan-empty`) after account setup | Every testid in Appendix A is still present. New: `words-minus, words-per-lesson, words-plus, words-hint, words-rec, words-random, words-note`, `zoo-family` (after a tile tap), `plan-meta`. | Same |
| 73 | Pictures stepper | Legacy, fresh. `#picsPlus` → `#optPics` 9, meta "· 9 pictures · ~5 min", rec 3. `#picsMinus` ×4 → 6, then once more → stays 6. Fill 99 + change → 30. `#picsPlus` at 30 → stays 30. Reload. | Values as listed. Persisted `settings.pics` 30. | Non-goal "Pictures range 6–30" |
| 74 | Languages, parent switch, test buttons | Toggle `#optEn/#optDe/#optEs/#optParent`. Unchecking all three re-checks EN. | Unchanged behavior. Stored flags match. | Regression |
| 75 | Dinner card | H8 after one lesson | `#dinnerSub` "N words to slip into conversation" (N ≤ 4). `#dinner` has N `.dcard`. Back button returns to Today. | Spec "For architect" 5 (dinnerWords limited to N objects: records the actual count, not a failure if <4) |
| 76 | Legacy storage keys and shapes | After the legacy scenarios | Only `rr-pilot-v1-dev` (+ `rr-tab-dev` in sessionStorage) is written in legacy. Earned entries are `{id,day}`. No new top-level keys except `settings.lessonWords`. | "Must NOT change: storage keys" |
| 77 | Protected files unchanged | sha256 vs. the baseline below | `index.html` a78010d861a3920a…, `uat/index.html` 4c355937f568ba8d…, combined hash of `family-buddy/ supabase/migrations/ uat/` (command below) = 427024bc309ac481 | Sprint pt. 4 |
| 78 | Existing account suites | Re-run the previous QA flows for sign-in, onboarding, own words, import offer and sign-out, if their scripts exist. Otherwise smoke: sign in, add an own word, toggle a built-in, sign out (one session). | No regression, sync status ends "Synced HH:MM". | Regression |

Baseline commands (taken 2026-10-01, before the WA build):
`shasum -a 256 index.html uat/index.html` and
`find family-buddy supabase/migrations uat -type f -not -path '*/node_modules/*' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256` (the first 16 hex characters are listed above). If `npm ci` creates `family-buddy/node_modules` it is excluded. A `package-lock.json` change from `npm ci` must be reverted, not counted.

---

## Spec defects for ba-product-owner

**All three resolved in the 2026-10-01 spec revision; no open spec defects.** SD-1 → R-W2 step 5 tops up with new objects only after every heard object was offered (#19, #91). SD-2 → gifts without a valid day are not shown or counted (#63, #81). SD-3 → `""`, `null`, booleans, non-numeric → `"rec"` (#10, #12). Original text kept below for the record.

- **SD-1 (major, affects AC-5/AC-2/AC-9 wording).** R-W2 step 5 ("any remaining eligible objects … so that N is always reached") fills slots with *unheard* objects when there is little review history. That breaks rule 3 / AC-5 ("at most 2 of the 5 objects are new") for a fresh child. AC-2 and AC-9 only reach 4 or 3 objects on a fresh child *because* of step 5. Question: on a fresh child with fixed 5, is the lesson 5 objects (5 new) or 2 objects (N capped by available new + review)? Recommendation: keep rule 3 strict (non-goal: "changing rule 3"). Step 5 then only adds objects that have a heard pair, and Effective N is capped at what steps 1–5 can supply. The edge-case title/meta then show the real N. My AC scenarios use seed H8 so they hold under either answer. Only #19 waits on this.
- **SD-2 (minor; partly settled by arch §7.1 for account mode).** R-A2 says "a missing day sorts first" (so a gift with a valid id and no day *counts*). The edge table says "`day` missing → ignored for display". Which one? #63 only asserts "no crash" until answered. Recommendation: count it (sorts first). An account gift without a day can't pass `okGift` anyway.
- **SD-3 (minor).** R-W7: "a non-number falls back to rec". The R-W1 accessor maps `""` to `Math.round(+"")` = 0, which clamps to 2. #10 expects `"rec"` for an emptied input per R-W7. Recommendation: the input handler treats an empty or NaN value as "rec" before calling the accessor.

## Observations (not spec violations)

- *(rev 2)* **At the default settings the in-lesson retry never happens.** With rec 3 × 3 languages = 9 pairs in 8 pictures, all 8 pictures are distinct planned pairs, so R-W5 rejects every re-insert (after turn t, room = 8 − t = the number of unplayed P0 pairs). A missed word comes back only in the next lesson (as a miss). This follows from R-W5 as written and is not a failure (#92), but the BA may want to know that the "listen again" retry is effectively off at the defaults. It only works when pairs < pictures (e.g. fixed 2, #32).
- *(rev 2)* AC-8's title is now "6 friends, 3 languages" (the spec edge table says so too); the rev-1 observation about "1 language" is obsolete.
- *(rev 2)* `planList` tag order now follows the rotation (e.g. spoon DE, ES, EN). The spec doesn't state tag order beyond "built from the capped queue"; #14/#84 assert the queue-derived order.
- *(rev 2)* BA expected values: QA had only the spec's own stated values to compare against (worked example, edge table, AC-10, AC-25, AC-28). All of them match QA's independent model; no disagreement found.
- *(rev 2)* The `dev/index.html` present at revision time (sha256 prefix `681a82765da0cff0`) implements the old rec formula and plain en/de/es tie-break; phase 2 must run against the rebuilt file.
- Playwright: installed by the developer (see §0). The rev-1 note about needing network is obsolete.

---

## Appendix A — baseline IDs and data-testids (current `dev/index.html`, 2026-10-01)

**Static ids (150):** acct, acctCard, acctOut, animalsCount, animalsMeta, asrNote, avatar, backendErr, backendLabel, bankNote, bedtime, btnChild, btnCode, btnOther, btnResend, btnRetry, btnSend, btnTerms, bwAllOff, bwAllOn, bwList, bwRows, bye, byeArt, byeText, card, cardwrap, chDe, chEn, chEs, child, childErr, childNote, chkTerms, codeEmail, codeErr, codeInfo, confetti, confirm, csv, cue, cueDo, cueLang, cueName, cuePlay, cueWord, cwDe, cwEn, cwErr, cwEs, cwForm, cwGrid, cwList, cwNeedDe, cwNeedEn, cwNeedEs, cwPicLabel, cwSave, dinner, dinnerBack, dinnerLink, dinnerSub, draftBody, draftClose, draftHead, draftPanel, draftWhich, eggs, exportBtn, friendRow, friendsCard, greet, hDinner, hSettings, hToday, hWords, hZoo, importCard, importMsg, importNo, importText, importYes, inCode, inEmail, inNick, lnkPrivacy, lnkTerms, micBtn, nickHint, noBtn, optDe, optEn, optEs, optParent, optPics, parent, party, partyArt, partyEggs, partyRays, partyShelf, partyStage, partyTap, partyText, partyTitle, picsMinus, picsPlus, planList, planMeta, planTitle, progNum, resetBtn, reveal, ring, scrBackendErr, scrChild, scrCode, scrSignin, scrTerms, scrWait, signOutBtn, signinErr, startBtn, stop, stopHint, stubBox, stubLink, syncStatus, tbl, termsErr, testBtn, testOut, topbar, turnCount, vDinner, vSettings, vToday, vWords, waitMsg, whoami, wordsCard, wordsEdit, wordsEditor, wordsMore, wordsSummary, yesBtn, zoo, zooGrid, zooMeta, zooSay. Runtime: envBanner.

(Counts from `grep -o ' id="…"' | sort -u` on today's file. A baseline copy was saved by QA on 2026-10-01 to the session scratchpad as `dev-index-baseline-pre-wa.html`; phase 2 diffs against it.)

**Static data-testids (52):** backend-error, backend-label, bw-all-off, bw-all-on, bw-list, child-error, child-lang-de, child-lang-en, child-lang-es, child-nickname, child-save, code-error, code-info, code-input, code-submit, cw-de, cw-emoji-grid, cw-en, cw-error, cw-es, cw-form, cw-list, cw-save, different-email, draft-close, draft-panel, import-msg, import-no, import-offer, import-yes, link-privacy, link-terms, onboard-signout, retry, send-again, signin-email, signin-error, signin-send, signout, stub-box, stub-link, sync-status, terms-accept, terms-continue, terms-error, turn-count, wait-msg, whoami, words-card, words-edit, words-editor, words-summary. **Runtime:** cw-row, cw-toggle, cw-delete, cw-emoji, bw-row, bw-toggle, plan-empty.

Baseline `dev/index.html` sha256 prefix 8f2a06bbecd15d78 (saved copy has the same hash).

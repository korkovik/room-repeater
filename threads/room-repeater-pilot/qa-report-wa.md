# QA report: Increment WA ("Words per lesson" + "Animal families"), phase 2

**What I did:** I ran all 92 scenarios of `testplan-wa.md` rev 2 headless (Playwright 1.56.1, Chromium) against `dev/index.html` sha256 `e51af25c61e9e51c…`. I used my own scripts and checked 424 assertions in `?backend=off` and `?backend=stub`, plus the static and checksum checks.
**Result: PASSED.** 91 passed, 0 failed, 0 blocked, 1 deferred (#82 device part: real Android 10+ emoji rendering). No page errors, no `console.error`, and `#asrNote` never showed "Error:".
**Next:** Tom's UAT on his phone (steps at the end; they also cover the deferred #82). The plan corrections and observations below are not blockers.

QA engineer, 2026-10-01. Reference: `spec-wa.md` (revised 2026-10-01, AC-1…AC-28). The spec, `dev/index.html` and the protected files were not modified.

## Harness (as in testplan §0)
- `python3 -m http.server 8765` was run from the repo root and stopped afterwards. The app was at `http://localhost:8765/dev/`.
- Playwright came from `scratchpad/pw/node_modules` via `NODE_PATH`. The QA scripts are in `scratchpad/qa/`: `lib.js`, `words.js`, `w22.js`, `animals.js`, `stub.js`, `static.js`. They do not import the developer's `pw/*.js`.
- The clock was set with `page.clock.install(2026-10-01T09:00Z)`, and the speech stub is the one from §0. Raw results are in `qa/out-words.json`, `out-animals.json`, `out-stub.json` and `out-static.json`.
- Expected queues come from `qa/oracle.js`, which I wrote from the spec text only. Its values matched every value the spec states.
- Sign-out confirm dialogs were auto-accepted. They show up only when the outbox is not empty (#47), which is existing behaviour.
- **Two-phone simulation:** each second phone (B, C) got its clock installed 5 s *after* phone A's current time. Real phones share wall time. Without the offset, B's settings timestamp came out earlier than A's and last-write-wins correctly ignored it, which is a harness artifact.

## Scenario results

| # | Spec ref | Result | Evidence (observed) |
|---|---|---|---|
| 1 | AC-1 | PASS | Input 3, enabled. Hint "Recommended for her: 3. A few words heard often…". Random off, `words-rec` hidden, note empty. mode/rec/target = rec/3/3 |
| 2 | AC-1, R-W1 | PASS | H8 without the key gives the same result |
| 3 | R-W7 | PASS | Row order in the "Session" group: Words → Random → Pictures. Input number 2–8. aria-labels "Fewer words" / "More words". Labels match the spec |
| 4 | rec def | PASS | 6/3…8/1 → rec 3,3,3,3,4,3,3,4,4,4. The input shows the same values |
| 5 | R-W6, rotation | PASS | Unchecking ES gives 4 and "Recommended for her: 4". Title "4 friends, 2 languages". The queue matches the plan exactly. Note empty |
| 6 | R-W7 | PASS | + gives 4, mode 4, hint "Recommended: 3", "Use recommended" visible, stored 4 |
| 7 / 8 | R-W7 bounds | PASS | + values 4,5,6,7,8,8. − values 7…2,2 (fixed 2) |
| 9 | R-W7 | PASS | Typed 5/0/9/3.6 → 5/2/8/4 (fixed) |
| 10 | R-W7, SD-3 | PASS | `''` and `'abc'` → mode rec, input 3, rec hint, `words-rec` hidden |
| 11 | R-W1 | PASS | 5 survives a reload |
| 12 | AC-11 | PASS | Stored "abc",99,1,3.6,null,"",true,"5","random","rec" → rec,8,2,4,rec,rec,rec,5,random,rec. Title renders, no errors |
| 13 | AC-2 | PASS | "4 friends, 3 languages", `plan-meta` "4 words · 12 pictures · ~6 min". Queue = the 12-item rotation from the plan. n=4 |
| 14 | R-W6 | PASS | Rows 📖 EN,DE,ES / 🥄 DE,ES,EN / 🐶 ES,EN,DE, then "+ 1 more" |
| 15 | AC-27 | PASS | Note "…; 12 pictures fit them all." At 12 pictures: empty |
| 16 | AC-3 | PASS | 12 turns played in exactly the previewed order, then the party |
| 17 | R-W3 | PASS | Queue book-en, spoon-de, dog-es, book-de, spoon-es, dog-en, book-es, spoon-en, played identically. The `why` marks were checked by inspection only, because the hook does not expose `why` |
| 18 | AC-5(a) | PASS | book, spoon, dog, cat, ball. 2 unheard |
| 19 | AC-5(b) | PASS | dog, cat, ball, apple, car. Queue as in the plan. "5 friends, 3 languages" |
| 20 | AC-6 | PASS | Objects dog, book. Queue dog-en, book-de, dog-de, book-es, dog-es, book-en, dog-en, book-de (`why` by inspection) |
| 21 | R-W2 stale | PASS | dog, book |
| 22 | R-W2 step 4 | PASS *(plan corrected)* | See "Test-plan corrections" |
| 23 | R-W2, R-W6 | PASS | "Play again". Objects cup, banana, cat. Queue as in the plan. Meta "8 turns today · 8 said back · 3 words · 8 pictures · ~4 min" |
| 24 | AC-7 (stub) | PASS | "1 friend, 3 languages", "1 word · 8 pictures · ~4 min", n=1, no note |
| 25 | AC-7 (legacy) | PASS | 180 dropped keys give the same title and meta |
| 26 | R17 | PASS | `plan-empty` text unchanged, Start disabled |
| 27 | AC-8 | PASS | Input 8, "Only 6 words fit in 6 pictures.", "6 friends, 3 languages". Queue book-en…apple-es. "6 words · 6 pictures · ~3 min" |
| 28 | edge own DE | PASS | DE-only own word is eligible. All its items are `de` |
| 29 | AC-10 | PASS | Before: note "…18 pictures…". After "Use recommended": rec, 3, rec hint, button hidden, note empty, "3 friends, 3 languages", "3 words · 8 pictures · ~4 min" |
| 30 | R-W6 | PASS | `#planMeta` updated right after +, pics+ and unchecking DE |
| 31 | AC-4 | PASS | Turn 1 missed. All 8 planned objects played in the planned order. Party shown |
| 32 | R-W5 positive | PASS | Sequence book-en(missed), spoon-de, book-de, spoon-es, book-en, book-es, spoon-en, book-en. Retry said, all 6 P0 pairs played |
| 33 | R-W4 | PASS | target 3,4,5 (k=0,1,2) and 2 on 2026-10-02 |
| 34 | lesson index | PASS | G13 (all before today) → 3 |
| 35 / 38 | R-W7 Random | PASS | Random: input 3, input and both buttons disabled, hint "Random each lesson: 2–5 words.", stored "random". Unchecked: rec, all enabled, 3, rec hint, note empty |
| 36 | AC-9 | PASS | "3 words (random) · 8 pictures · ~4 min". Played = preview. After: "4 words (random)", input 4 (disabled), queue cup-en, banana-de, cat-es, ball-en, … |
| 37 | R-W4 | PASS | A 1.9 s hold on ✕ after 2 turns ends the session. Still "3 words (random)", no gift |
| 39 | R-W6 | PASS | No "(random)" in fixed mode |
| 40 | R-W1, AC-1 | PASS | New child on the server has `lessonWords:"rec"`. Shows 3, rec hint, empty note, "3 friends, 3 languages" |
| 41 | AC-12 | PASS | A=5 → server 5 → B shows 5, target 5. B sets Random → A pulls → Random, "(random)", lastErr null |
| 42 | AC-13, R-W8 | PASS | Server row without the key + pics 10: A shows pics 10, mode stays 5. After sync the server has `{pics:10, lessonWords:5}`. See observation O-1 |
| 43 | edge old client | PASS | Fresh device + server without the key → rec |
| 44 | AC-14 | PASS | 61 off + random + pics 30: outbox 0, lastErr null, 558 chars ≤ 4096 |
| 45 | R-W1 import | PASS | "Imported: 24 turns, 13 animals.", mode 6, input 6, server 6 |
| 46 | edge Random sync | PASS | B (k=2): "5 words (random)". After A's gift is pulled (k=3) B re-renders to "2 words (random)" with no user action, and B's next session played 2 objects. My own FNV check: `2026-10-01\|3` → 2 |
| 47 | wipeDom | PASS | Hint and note filled at fixed 6. After sign-out both are empty and the sign-in screen shows |
| 48 | R-A1 | PASS | 40 entries match the spec table field by field. The first 12 are identical to the baseline. Squirrel = U+1F43F U+FE0F. 🦩, 🦥 present |
| 49 | R-A3/6/7 | PASS | next rabbit, "0 friends", both empty-state texts. Grid: next 🐇 + 39 eggs. friendRow `?` + 4 empty |
| 50 | R-A4/6 | PASS | Reveal 🐇 (no `.acc`), "Rabbit is here!", stored `{id:'rabbit',day:'2026-10-01'}`, rabbit/Hase/conejo spoken, "1 friend", "1 family · someone new comes after the next session." |
| 51 | R-A3 | PASS | next penguin. 5 earned, then next penguin, then 34 eggs |
| 52 | AC-15 | PASS | Reveal 🐈, "Cat is here!", art 🐈, stored `{id:'cat',day}` |
| 53 | AC-19 | PASS | "13 friends", "12 families · …", zooMeta exact. counts: rabbit 2, others 1 |
| 54 | AC-20 | PASS | 12 earned buttons (rabbit `data-count=2` "×2"), then next cat 🐈, then 27 eggs = 40 |
| 55 | AC-21 | PASS | Members: 🐇 #1 plain, 🐇 #2 + 🎀 + badge "2". Names line correct. Spoken rabbit, Hase, conejo |
| 56 | R-A7 | PASS | "Who's coming? Finish a session to find out.", spoken "Who's coming?" |
| 57 | R-A6 | PASS | friendRow 🐙 🦩 🐪 🐇#2+🎀 ? |
| 58 | AC-16 | PASS | Reveal 🦆 without accessory. Art 🦆+🎀 (no `.num`). "A second duck joined the duck family!". Shelf has 2 members, the new one in `span.new` |
| 59 | AC-17 | PASS | 412 gifts. "Cat number 11 joined the cat family!", 👓. Shelf "+3", then members 4–11, with 11 new |
| 60 | R-A4 | PASS | "A third cat…", "A tenth cat…" |
| 61 | AC-18 | PASS | 100 steps with a reload each: consecutive (id, member) pairs always differ. 40 keys: #1–#20 have 3, 20 have 2. next mouse. "100 friends · 40 families · …". Grid 40 earned + next mouse + 0 eggs |
| 62 | AC-18 | PASS | 3 real lessons: third mouse, third hedgehog, third squirrel |
| 63 | R-A2, SD-2 | PASS | Unknown and malformed entries are ignored. Totals as in #53, next cat (cat tile = next). All 18 entries are kept after a save |
| 64 | AC-23 | PASS | Pulled unicorn: not counted, count unchanged, kept in `rr-acct-dev`. Flush clean, the row is on the server once |
| 65 | AC-22 | PASS | Server gift keys `animal, child_id, created_at, day, id(uuid)`, animal rabbit. B: `{rabbit:1}`, "1 friend" |
| 66 | AC-22 | PASS | B's gift = duck. A: rabbit 1 + duck 1, "2 friends" |
| 67 | AC-24 | PASS | Import of G13: "13 friends", "12 families…", zooMeta exact, next cat |
| 68 | edge / X-2 | PASS | Offline A and B each earned a cat. After sync: 2 cat rows with different uuids, `counts().cat`=2 on A/B, and identical `zoo-family` markup on A, B and C. The uuid tie-break itself was checked by code inspection (`members()` sorts by day, then `String(id)`) |
| 69 | R-A4 | PASS | grep "is here again\|that's all" = 0 |
| 70 | R-A8 CSS | PASS | Rabbit (×2) and duck tiles are the same size (±1 px) |
| 71 | regression IDs | PASS | All 150 baseline static ids + `envBanner` are present after load. 7 new ids present |
| 72 | regression testids | PASS | All 52 baseline testids. Runtime cw-row/toggle/delete/emoji, bw-row/toggle, plan-meta present. New testids present |
| 73 | Pictures stepper | PASS | 9 ("· 9 pictures · ~5 min", rec 3) → 6 → stays 6. 99 → 30 → stays 30. Persists 30 |
| 74 | regression | PASS | Languages toggle and are stored. All three off re-checks EN. Parent switch toggles |
| 75 | regression | PASS | "4 words to slip into conversation", 4 `.dcard`. Dinner opens, Back returns to Today |
| 76 | storage keys | PASS | localStorage only `rr-pilot-v1-dev`, sessionStorage only `rr-tab-dev`. Earned `{id,day}`. No new top-level keys |
| 77 | protected files | PASS | `index.html` a78010d861a3920a, `uat/index.html` 4c355937f568ba8d, combined family-buddy/supabase/migrations/uat 427024bc309ac481, all equal to the baseline. `git status`: only `dev/index.html` (M) and `threads/` (??) |
| 78 | account smoke | PASS | Sign in, add own word, switch cat off, sync: "Synced HH:MM", server has 1 word and off `["cat"]`. Sign out works |
| 79 | X-1 | PASS | In rec mode, a pull without the key leaves outbox 0. Server stays without the key, mode rec |
| 80 | X-3 | PASS | With `{}` and `{animal:'cat'}` (no day) in `earned`, a lesson still syncs: outbox 0, lastErr null, server +1 gift and +8 turns. Malformed entries stay local only |
| 81 | arch §6 | PASS | Unicorn dated today → target 4. Rabbit without a day → 3 |
| 82 | X-4 | **Deferred to Tom's UAT** (headless part PASS) | Headless: squirrel = `\u{1F43F}️`. Accessories for members 1–13 = (none) 🎀 🎩 👑 🧢 🕶️ 🎈 🌸 ⭐ 🧣 👓 🎒 🌼 (🕶️ with FE0F). 0 `.acc` inside `.shadow`. Device rendering needs a real phone |
| 83 | R-A5 | PASS | `.shadow .mem/.acc/.num` = 0 in the zoo and in the reveal (#58) |
| 84 | AC-25 | PASS | "3 friends, 3 languages", "3 words · 8 pictures · ~4 min". Queue dog-en, cat-de, ball-es, dog-de, cat-es, ball-en, dog-es, cat-en. planList 🐶 EN,DE,ES / 🐱 DE,ES,EN / ⚽ ES,EN, with no "+ more". No "wait"/"fit" text on the Today card |
| 85 | AC-25/AC-3 | PASS | 8 turns played as previewed. Gift rabbit |
| 86 | AC-26 | PASS | Note empty at 8/3, at 6/3 and with H8. At 6: rec 3, queue dog-en…ball-en, "3 words · 6 pictures · ~3 min" |
| 87 | AC-27 | PASS | (a) 12-pictures note. (b) empty. (c) "9 pictures". (d) empty + 9-item queue as planned. (e) empty. Never "only"/"not" |
| 88 | R-W7 rule 3 | PASS | (a) target 3, note "9 pictures". (b) target 5, n 5, note "15 pictures", queue as planned, "5 words (random)" |
| 89 | AC-28 | PASS | "Play again". Objects ball, apple, dog. Queue starts ball-de (full queue as planned). Meta "8 turns today · 8 said back · 3 words…". First row ⚽ DE,EN,ES |
| 90 | R-W7 pairs | PASS | Pool order: own word, dog, cat. 6 pictures: note "…; 7 pictures fit them all." Queue K-de, dog-de, cat-es, K-de, dog-es, cat-en. 7 pictures: note empty |
| 91 | edge 1 heard | PASS | cat, ball, dog, apple, car. Queue as planned |
| 92 | R-W5 no room | PASS | Turn 1 dog-en missed and not retried. All 8 planned pairs played in order. Party shown |

**Totals: 92 scenarios: 91 PASS, 0 FAIL, 0 BLOCKED, 1 DEFERRED (#82 device part).** Every AC from AC-1 to AC-28 is covered by at least one passing scenario.

## Test-plan corrections (QA's own errors, not defects)
- **#22:** the plan's seed puts cat on 2026-09-25, which is 6 days ago, so cat is *stale* (R-W2 step 2, ≥4 days) and takes the first slot. Spec, app and QA oracle all agree on the observed `cat, book, spoon, ball` (queue cat-en, book-de, spoon-es, ball-en, cat-de, book-es, spoon-en, ball-de). The plan's expectation `book, spoon, cat, ball` was my mistake. To test what #22 was meant to check ("review oldest first, heard-today last"), I added variant 22b: cat on 09-28, the others on 09-29, dog today. Expected and observed: book, spoon, cat, ball (book-en, spoon-de, cat-es, ball-en, …). Both pass (`qa/w22.js`).
- **#42:** the plan dated the old client's write 60 s in the *future*. I ran it in the realistic order instead (old write at A's time +1 s, then A pulls 1.5 s later), which passes. I also ran the literal variant; see O-1.
- **#68:** the plan's "exchange DB" step loses rows when one phone's auto-flush on `online` writes to its own stub DB just before an `importDb` overwrites it, which is a harness artifact. I reran it in a sequential order that loses no rows: B flushes; A imports B's DB, goes online, flushes and pulls; then B pulls.

## Observations (not spec violations)
- **O-1 (minor, clock skew):** if an old client's `settings_updated_at` is later than this phone's clock (literal #42: +60 s), the pull still applies and the local mode correctly stays 5. But the self-heal push is older than the server row, so last-write-wins drops it without an error: outbox 0, lastErr null, server row still without `lessonWords`. A fresh device would then start at "rec". This needs clock skew plus an old cached build at the same time, so it is very unlikely in the pilot. The spec's self-heal only says "re-queue". Possible future fix: re-stamp the self-heal at `max(now, pulled updated_at + 1 ms)`.
- **O-2:** the plan's rev-2 observation still holds. At the defaults (3 words × 3 languages, 8 pictures) the in-lesson "listen again" retry never fires (#92), as R-W5 requires.
- **O-3:** in legacy mode `settings.lessonWords` is only written once the parent changes the setting. Until then the accessor's default "rec" applies (#76). That is consistent with R-W1.
- **O-4:** `RR_LESSON.queue()` returns `{obj,lang}` only (as specified), so I verified the `why:'review'` marks (#17, #20) by reading `buildQueue` rather than by running it.
- Security's 4 MINOR findings (`security-wa.md`) are unchanged by this QA pass. None affects an AC.

## Deferred to Tom's UAT: #82 emoji on a real Android 10+ phone
This can't be run headless, and it needs the dev build reachable from the phone (hosting is Tom's call).
1. On the Android phone (Android 10+, current Chrome), open the dev build with `?backend=off` (legacy mode, so no account is needed), go to **Animals**, and check that the "next" silhouette is solid black.
2. To see all 40 animals and the accessories, seed the history: connect the phone over USB, open `chrome://inspect` on the laptop, inspect the tab and run:
   `localStorage.setItem('rr-pilot-v1-dev',JSON.stringify({v:2,log:[],dropped:[],earned:RR_ANIMALS.roster().flatMap((a,i)=>[{id:a.id,day:'2026-0'+(1+i%9)+'-1'+(i%9)}]).concat(Array.from({length:12},(_,i)=>({id:'rabbit',day:'2026-09-'+(10+i)}))),settings:{en:true,de:true,es:true,pics:8,parent:true}}));location.reload()`
3. Pass if 🦩 (flamingo, #11), 🐿️ (squirrel, #23) and 🦥 (sloth, #32) show as emoji, not boxes. Then tap the rabbit tile: 13 members, with all 12 accessories (🎀 🎩 👑 🧢 🕶️ 🎈 🌸 ⭐ 🧣 👓 🎒 🌼) visible, and no tofu boxes.

## UAT note for Tom (ready to paste into handback.md; I was told to write only this file)
`- [ ] 2026-10-01 qa-engineer: UAT of increment WA on your phone (about 10 min) — QA passed 91/92 headless, and only real-device emoji rendering is left — steps: (1) fresh start: Settings shows "Words per lesson 3", Today shows "3 friends, 3 languages"; play one lesson tapping 👏 and check that the 🐇 silhouette appears halfway and "Rabbit is here!" at the end; (2) Today again: the next lesson starts with ⚽ ball in DE; (3) Settings: tap + to 4, check the gentle note "…12 pictures fit them all.", then "Use recommended" removes it; (4) switch "Random each lesson" on and check that Today shows "N words (random)"; (5) Animals tab on Android: 🦩/🐿️/🦥 and accessories render (seeding steps in qa-report-wa.md §Deferred).`

```
VERDICT: PASSED
Scenario results: 91 passed, 0 failed, 0 blocked (of 92), 1 deferred to Tom's UAT (#82 device part)
Verified by inspection rather than execution: why:'review' marks (#17, #20); the uuid tie-break inside members() (#68; display equality on 3 devices was executed).
Observations: O-1 self-heal lost under clock skew (minor); O-2 retry never fires at defaults (by design); O-3 lessonWords is not written to legacy storage until changed; O-4 hook does not expose why.
```

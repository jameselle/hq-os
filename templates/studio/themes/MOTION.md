# Motion and caption rules for the card kit

Rules for 1080x1920 explainer cards (`kit.py`, `kit_editorial.py`) and Studio's captions, in our own words.
They are distilled from these sources, cited by short name:

- **KT**: kinetic-typography-skills.
- **DATA**: data-animation-skills.
- **EXPL**: explainer-video-skills.
- **LT**: lower-thirds-skills.
- **SHORT**: tiktok-video-skills.
- **pycaps**: francozanardi/pycaps (MIT).
- **hv**: the GSAP timelines in nexu-io/html-video (Apache-2.0).

KT, DATA, EXPL, LT and SHORT are iart-ai's motion-skills packs (MIT). No text or code is copied from any source.
Where the sources disagree, the number we pick is marked as our call.

Each rule is marked:

- ✅ the kit already does this, naming the helper where it does
- ⚠️ partly
- ❌ not yet (each ❌ has a fix under "Changes worth making in kit.py" at the end)

Times are in seconds. At 30 fps, 0.1 s is 3 frames.

## 1. One motion vocabulary

| Use | Ease | Time | Kit |
| --- | --- | --- | --- |
| Entrance (text, cards, panels) | `expo.out` = cubic-bezier(0.16,1,0.3,1), or `power3.out` | 0.4 to 0.6 | ✅ `rise` (power3.out 0.5), `enter` (0.42); editorial cards use expo.out |
| Pop for small things (icons, chips, dots, nodes) | `back.out(1.5 to 2)`, never above 3 on anything large | 0.3 to 0.45 | ✅ `popIn` back.out(2) 0.38; ⚠️ `stat_window` head and the `list_window` ticks use back.out(3) |
| Exit | ease-in (`power2.in`), about two thirds of the entrance | 0.25 to 0.4 | ✅ `leave` power2.in 0.3 against `enter` 0.42 (71%) |
| Move, wipe or re-rank | `power2.inOut` / `power3.inOut` | 0.5 to 0.9 | ✅ `draw` power2.inOut; `ranking` climb power3.inOut 0.8 |
| Number roll and bar growth | ease-out cubic (`power3.out`), finishing together | 0.9 to 1.4 | ✅ `count` power2/3.out; `ranking`/`donut` share one curve for bar and figure |
| A stroke tracking time (a line chart, a pen) | `none` (linear); ease-in-out makes a pen lurch | about 1.2 to 2.2 | ✅ `chart_story` (none, with the dot riding the head); ⚠️ `stat_window` draws its chart power2.inOut |
| Ambient drift (backdrops, a hold zoom) | `none` or `sine.inOut`, a few px or 2 to 5% | the whole card | ✅ `hold`, backdrops |

**Use one vocabulary per video.** Use the same enter curve, exit curve and pop everywhere, and keep the big moves
for section breaks (EXPL, DATA).

- ⚠️ The kit mixes power2.out, power3.out, expo.out and back.out(1.4 to 3) across its helpers. Each is fine on
  its own, but together they read less like one hand made them.

## 2. Staggers and holds

**Staggers**

- Lines: 0.06 to 0.1 between masked lines; 0.15 to 0.2 for poster lines (KT, hv).
- Words: 0.04 to 0.07 when not voice-synced (KT).
  - ✅ When voice-synced (`ink` with `WT`), the word lands on its spoken time, which beats any stagger.
  - ⚠️ The unsynced fallback in `ink` is 0.16 to 0.17 per word, which is slow. Use 0.08.
- Characters: 0.02 to 0.04, and only on short strings (KT).
  - ✅ No helper splits long copy by character. `typeOn` is a typewriter, not a reveal.
- Sibling items, cards and bars: 0.2 to 0.33 s (6 to 10 frames) is crisp; above 0.5 it drags (DATA).
  - ✅ `rise(..., stagger: 0.12)`, `popIn` stagger 0.15 to 0.3, `ranking` 0.12, `stat_anchor` bars 0.08.
  - ⚠️ `bars_window` grows bars on a 0.5 s step. That is fine for two bars and slow for five.

**Read and hold times**

- Voice pace is about 2.3 words a second, nearer 2.0 on numbers. Size a card as its words / 2.3 + 0.4 s (EXPL).
  - ✅ `write_cards` takes the voice slot plus ~0.8 s and leaves 1 s for the exit.
- A beat with no voice needs at least 1.0 s on screen (EXPL).
- Hold the composed frame:
  - 0.5 to 1.5 s after each diagram step
  - 1 to 1.5 s at the start of a chart (axes and units)
  - 2 to 3 s at the end of a chart or infographic (DATA, EXPL)
  - ⚠️ Data cards reach their settled state 2 to 3 s in, so a `dur` under ~4.5 s cuts the final hold short. Give
    `chart_story` at least 5.5 s and `flow_tree` at least 5.5 s.
- Do not move things while they are being read. Only one slow ambient move (a sheen, a slow zoom) is allowed
  during a hold (LT).
  - ✅ `hold` is a 1.8 to 5% push on `none`.
  - ⚠️ `headline` keeps its burst thumbnails bobbing and its dot shuttling while the words ink in.
  - ⚠️ `hub` floats its cards (yoyo, repeat 2) while the line inks in.

## 3. How many things move at once

1. **Only one thing moves at a time.** Use one focal motion; every other element is still or finished
   (DATA, EXPL).
   - ✅ `ranking`, `chart_story` and `timeline` run their beats in sequence.
   - ❌ `stat_window` starts two counters 0.15 s apart, so both roll at once (DATA says never roll two numbers
     together). Stagger the second counter until the first lands, at 1.3 s or later.
2. **Reveal in order of importance, not layout order.** Title, then the mark, then the number, then the label,
   then the connector (DATA).
   - ✅ `stat_anchor`: rules, ghost, label, number, rule, sub, bars, strip.
3. **Overlap only to keep things flowing.** A next item may start when the previous one is 60 to 70% done (hv
   bars: 0.8 s long on a 0.5 s step). Connectors start 0.3 s before their target node finishes (EXPL).
   - ✅ `flow_tree`, `ranking`.
4. **Focus plus context.** When one item is the answer, it goes accent and the rest drop to soft (about 35 to
   50%), over 0.3 to 0.35 s (EXPL).
   - ✅ `flow_tree` (only the other cards' words fade, to 45%; the cards stay solid so lines never show through), `versus`
     (left card to 0.7), `bars_window` (one accent bar).
5. **One idea per card, with 3 to 5 data points** (DATA).
   - ✅ The helpers cap their inputs: `ranking` at 6 rows, `timeline` at 5 events, `flow_tree` at 3 x 2,
     `stat_anchor` at 6 bars and 3 stats.

## 4. Kinetic type

- **Split by line for calm, by word for energy, by character only for one or two words** (KT).
  - ✅ `ink` works per word; `split_quote` and `kinetic_lines` work per line.
- **Mask reveal is the robust default.** Put the line in an `overflow:hidden` wrapper and bring the child up
  from `yPercent: 105 to 110`, expo.out, 0.6 to 0.8 s (KT, hv).
  - ✅ `split_quote`, `kinetic_lines`.
  - ❌ The kit's own cards never mask; they blur-rise instead.
- **Blur-in is fine if the radius is modest:** 7 to 12 px over about 0.25 to 0.7 s (KT).
  - ✅ `ink` uses 7 px.
  - ⚠️ `enter` blurs the whole stage 18 to 26 px in some themes (gallery, glass). It is short (0.42 s), but it
    is the largest blur in the kit.
- **Emphasis word.** Pop it on the stressed word, 0.4 s, from scale 0.45 to 0.9, back.out(1.7) (EXPL, KT).
  - ✅ `kinetic_lines` accent lines; `strike` correction pill.
- **Poster stacks.** Size each line to the column width so short lines go huge. Tilt them by -3 to +2 degrees
  (hv bold-poster).
  - ✅ `kinetic_lines`. The tilt sits on the mask wrapper, never on the element GSAP moves.
- **Display type.** Line-height 0.95 to 1.1 and tracking -0.01 to -0.03 em.
  - ✅ The theme tokens `--head-lh` and `--head-track`.
- **Sizes on a 1080 wide frame:**

  | Element | Size | Kit |
  | --- | --- | --- |
  | Body text | at least 45 px | ⚠️ `cheat_sheet` rows 36, `read_card` 40, `page_card` 40 to 44, `flow_tree` leaves 38. All are saveable formats, made to be paused and read, so this is a judgement call. |
  | Captions | 56 to 80 px | |
  | Hook | 76 px or more | |
  | Hero stat | 180 to 250 px (SHORT, DATA) | ✅ `big_number` 230, `stat_anchor` 250 |

- **Split and measure text only after fonts load** (KT).
  - ✅ `page()` waits on `document.fonts.load(...)` before any fit runs.

## 5. Data animation

**Chart order** (hv news chart, DATA):

1. Title wipes left to right (clip-path, about 0.8 to 1.2 s).
2. Gridlines rise bottom to top, 0.08 to 0.25 apart, with their labels.
3. Axis labels.
4. Marks (bars or line).
5. Value labels after each mark lands.
6. The one annotation.
7. The source line, last.

- ✅ `chart_story` follows this order.
- ⚠️ `stat_window` and `bars_window` have no axis or units, which is fine for a "proof" shot. Use
  `chart_story` when the viewer needs to read values.

**Marks**

- A dot pops on each point as the line reaches it: 0.25 to 0.3 s, back.out(2 to 3) (EXPL).
  - ✅ `chart_story`.
- Draw an area chart's stroke first, then let the fill follow behind it (DATA).
  - ✅ `chart_story` and `stat_window`. Their clip-rect fill tracks the head.
- The bar and its number share one growth curve and land together (hv data-rollup).
  - ✅ `ranking`, `bars_window`.

**Highlighting**

- Highlight one series: one accent, the rest muted (12 to 25% ink, or `--bar-dim`). Colour carries meaning, so
  never reassign it within a video (DATA, EXPL).
  - ✅ All data cards.
- Annotate only at the moment it matters, with one callout per chart. Bring it in about 0.3 s before the voice
  reaches it and hold it at least 1.5 s (DATA).
  - ✅ `chart_story` `note` draws a leader to the marked point.
  - ⚠️ The callout is not yet voice-cued; it lands at line end + 0.25 s.

**Counters**

- Round every frame and use thousands separators (DATA).
  - ✅ `count`, `roll`.
- Show percentages with one decimal when the data has one (DATA).
  - ❌ `count` always rounds to whole numbers (4.2% shows as 4%). Fix: `roll` in `kit_editorial.HEAD_JS` keeps
    the decimals.
- Use tabular figures (`font-variant-numeric: tabular-nums`) so digits do not jitter while rolling (DATA).
  - ❌ `kit.py` does not set this on `.stat b`, `#nb`, `.bval` or `#cv`.
  - ✅ The editorial cards set it.
- Keep the headline number to 12 characters or fewer (hv pentagram).
  - ✅ `fitW` guards the width, not the length.
- Never move a headline number linearly (DATA).
  - ✅ No helper does.

**Bar race**

- The y position follows the rank. An overtake glides on an in-out curve at 0.3 to 0.6 s per position, slower
  at the crossover (DATA). Our call: one glide of 0.8 s, because we show one overtake, not a series.
  - ✅ `ranking(climb=True)`: one overtake at power3.inOut 0.8 with a 3% swell.
- Keep to 12 bars or fewer in a race and 7 or fewer in a static comparison.
  - ✅ `ranking` 6, `bars_window` any (⚠️ uncapped).

## 6. Explainer and diagram builds

- **Node, then edge, then label.**
  - Nodes: scale 0.6 to 0.85 to 1, back.out(1.5 to 1.7), 0.4 to 0.45 s.
  - Edges: draw over 0.5 to 0.55 s.
  - Labels: fade with a 6 to 10 px rise over 0.3 s (EXPL, hv decision tree).
  - ✅ `flow_tree`, `timeline`, `hub` (rays draw, then cards).
- **A connector starts after its source is in and lands before its target appears**, so the line leads the
  eye (DATA).
  - ✅ `flow_tree`.
- **Show what is being said, never ahead of it** (EXPL). Cue each step to its spoken word.
  - ✅ `ui_steps` (cue), `timeline` (cue), `flow_tree` (the picked leaf's words), every own-word card through
    `WT`.
- **A drawn stroke takes about as long as the words it illustrates. Handwriting runs 0.15 to 0.25 s a letter**
  (EXPL whiteboard).
  - n/a: the kit has no handwriting draw-on yet (`doodle` is a look, not a pen).
- **Use one analogy and one colour meaning per video** (EXPL).
  - This is a script rule; `hq:script` owns it.

## 7. Safe zones (1080x1920)

**Clearances**

- Keep these clear: top 120 to 130 px, bottom 300 to 370 px, right 110 to 120 px. The right-hand action rail
  sits from about y 900 to y 1500.
- The universal safe box is 900 x 1400 at (90, 260) (SHORT).
- ✅ The content band (y 300 to 1280) is clear at top and bottom. Captions (y 1300 to 1415) and the handle
  (y 1540) sit just above the bottom clearance.
- ❌ Most cards run to x 1000 to 1010 (a 70 to 80 px right margin). Inside y 900 to 1280 that is under
  TikTok's like and comment rail.
  - A low right-aligned value can be covered: a `ranking` value, a `stat_anchor` strip cell, or a
    `chart_story` last value when it ends low.
  - Fix: a 120 px right margin for y above 900 (see the changes at the end).

**Hook**

- The hook is on screen as text in frame 1, with no fade from black. About 85% of viewers watch muted (SHORT).
  - ✅ `enter` starts at opacity 0 but reaches full by 0.42 s.
  - ⚠️ For a reel's first card, use `exit=False` on the previous card and a hook card whose words are visible
    by 0.1 s.
- Change something every 2 to 4 s, at uneven intervals (SHORT).
  - ✅ Cards are 3 to 8 s, and the editorial cards have 3 to 5 internal beats.

## 8. Captions (Studio, `lib/studio/timeline.ts`)

**What Studio already does**

| Rule | Source | Studio |
| --- | --- | --- |
| Time captions with word-level stamps, never split evenly | SHORT | ✅ word times from the transcript; ⚠️ `timeline.ts` spreads words evenly only where stamps are missing |
| 1 to 4 words a line, at most 2 lines on screen | SHORT; pycaps presets use 10 to 20 characters | ✅ `captionLines(maxWords = 3)`, one line |
| Break at sentence ends and at pauses | SHORT, pycaps | ✅ breaks on `.!?` and on a gap over 0.6 s |
| Hold a line until the next starts so it never flickers | hv play-mode | ✅ holds to the next line or +0.4 s |
| Mark the spoken word in one accent colour with a quick pop: scale 1.25 to 1, 0.1 to 0.25 s; pycaps hype 0.12 s from 0.8 | SHORT, pycaps | ✅ `pop`: highlight colour, 125% to 100% in 110 ms |
| Unspoken words dim (40 to 50%) or hidden; spoken words settle to primary | pycaps | ✅ `reveal`: muted to primary over 240 ms with a 3 px blur |
| Never animate every word at once | SHORT | ✅ |
| Fade a line out over about 0.2 to 0.3 s | SHORT, pycaps | ✅ 200 ms |
| Captions over a card that shows the same words step aside | | ✅ `captions: False` on own-word cards (`headline`, `split_quote`, `kinetic_lines`...) |

**Gaps and open checks**

- Break a caption line on a pause over 0.15 to 0.3 s (hv), not only on 0.6 s gaps. Our call: break at
  0.35 s. At 0.6 s a natural breath often joins two phrases into one line.
  - ⚠️ Studio uses 0.6.
- Never end a line on a one-letter or two-letter word ("a", "to", "the") (pycaps
  `avoid_finishing_segment_with_word_shorter_than`).
  - ❌ `captionLines` can end a line on "the".
- Weight 700 to 800 and 56 to 80 px. Use a 4 to 6 px outline painted under the fill
  (`paint-order: stroke fill`), or a soft dark shadow (SHORT).
  - ✅ The theme captions set font, outline and box.
  - ⚠️ Size is per theme (`captionSize`) and unchecked against 56 px.
- Place the caption baseline 62 to 70% down, inside the centre 80% of the width (SHORT).
  - ✅ y 1300 to 1415 is 68 to 74% down. ⚠️ The lower edge sits slightly below that range.

## 9. Don'ts

**Timing**

- Never drive frames from `Math.random`, `Date.now`, CSS transitions or `repeat: -1`. Everything must be a
  pure function of a paused, seeked timeline.
  - ✅ The kit seeds in Python; HyperFrames lint enforces the rest.
- Never put a slow cross-fade between two colours that swap foreground and background.
  - Halfway through, the text is grey on grey (we hit this on the `flow_tree` pick).
  - Swap the fill in about 0.12 s and switch the text colour in one step.

**Layout**

- Never let a text block, a wipe or a mask be narrower than its text, or glyphs get clipped mid-hold (LT).
  - ✅ `fitW` and `fitH`.
  - `kinetic_lines` pads its masks by 0.02 to 0.06 em.
- Never fit by shrinking body text below about 30 px. Split the card instead (DATA).
  - ⚠️ `fitH` floors range from 22 to 90 px depending on the helper.
- Never dim text inside a card to `--soft`. `--soft` is a page colour; in `vivid` it is near-white, so it
  vanishes on a white card. Fade the words' opacity instead.
- Never let a translucent card sit over a connector.
  - ✅ The editorial cards stop connectors at card edges, because `glass` cards are translucent.

**Style**

- Never use fly-ins, spins or typewriters in a narrated build, because they compete with the voice (DATA).
  - ⚠️ `code_window`'s `typeOn` is the one typewriter. It works because the code is the subject, not a
    caption.
- Never open a recap on its biggest number, and never end a video on motion. End on a still hold of at least
  2 s (EXPL wrapped). This is a script and Studio concern.

## Changes worth making in kit.py

1. **Tabular figures for counters.** Add to `BASE_CSS`:
   `.stat b, .bval, #nb, #cv { font-variant-numeric: tabular-nums; }`
2. **Decimals in `count`.** In `BASE_JS` `count()`, format with
   `toLocaleString("en-US", { minimumFractionDigits: o.dec || 0, maximumFractionDigits: o.dec || 0 })`,
   and pass `dec` from `stat_window`, `big_number` and `bars_window` when the value has one.
3. **One counter at a time in `stat_window`.** Change the start offset from `0.45 + i * 0.15` to
   `0.45 + i * 1.0`.
4. **The unsynced `ink` fallback.** Default the step to `0.08` in `headline` and `hub` (it is 0.17 now).
   Voice-synced cards are unaffected.
5. **A right-rail-safe column.** Add `.col.rail { right: 120px; }` and use it, or move `right: 70px` to
   `right: 110px` on `.col` and `.winwrap` for anything below y 900. Studio's TikTok exports would be the
   first beneficiaries.
6. **Calm holds.** In `headline`, end the `.bt` bob and the `#dot` shuttle when the ink finishes (set
   `repeat` from the word count). In `hub`, stop the `.hc` float at `e`. Then only `hold` moves during the
   read.

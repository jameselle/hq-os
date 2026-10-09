# Themes: the card kit and Studio looks

One kit of animated cards (`kit.py`, Python writing HyperFrames projects, 1080x1920) and a set of **themes**.
A theme is a whole look: colours, type, backdrop, window style, device frame and motion feel in the cards,
and the matching captions and hook in Studio (`THEMES` in `lib/studio/brand.ts`, same names). Every card works
in every theme, so one script can be tried in several looks by changing one word.

Most of the winning formats in the research share three things worth copying in any theme: they read
without sound (the words are on screen), the strongest are short loops a viewer rewatches or pauses to read
(5 to 18 s; cheat sheets, briefs, chats and posts), and the hook is visual in the first second.

Each theme copies the **formula** of short-form clips that beat their own account's usual views (evidence
below), never a creator's footage, characters, logos, catchphrases or exact trade dress.

## The themes

| Theme | The look | Captions (Studio) | Found on |
| --- | --- | --- | --- |
| `bold` | Studio default: white Arial Black capitals with a black stroke, yellow pop | pop, capitals | our $1M series |
| `paper` | Warm cream paper, a line-art street drawing itself in, dark grotesk, terracotta accent, dark app windows | ink in on a pale strip | AI-tools reel, 8k comments |
| `gallery` | Pale grey studio with folds of light, floating white UI cards, italic serif capitals, chapter chips | big italic serif capitals | same creator, list reels |
| `desk` | Dark espresso spotlight, a laptop whose screen walks through steps, hand-drawn red arrows | white words | same creator, how-to reels |
| `terminal` | Green-tinted black, white sentence case, the keyword huge in green, mono header, progress bar | white words | TikTok dev account, 11x |
| `chart` | Editorial grey paper, red flag bar over titles, red against ink-blue data, no chrome | white on a dark box | news charts, 6x to 7x |
| `glass` | Lavender light with drifting colour, frosted glass cards, light grotesk sharpening out of a blur | dark, light weight | Apple-keynote glass type, 17x to 22x |
| `neon` | Violet-black, white hairline tunnel and rays, a travelling light, gradient accent words | white words | wireframe light piece, 14x |
| `canvas` | A design editor as the stage: artboard, blue selection handles, cursor, keyframe timeline | white text layer | design-tool account, 5x to 11x |
| `doodle` | Near-white, wobbly hand-drawn ink outlines, handwriting, flat blue/red/tan fills | handwriting | science doodles, 4.7x to 11.8x |
| `vivid` | A new saturated gradient per card, a glowing portal, accent words as tilted yellow sticker tags | white, low | science explainer, 3.8x |
| `letterbox` | White page, a casual hand-lettered title that stays up, everything inside one 16:9 band | casual hand font | money explainers, 7x to 115x |
| `lab` | Black with a slow field of points, hairline plots tracing in a violet-to-yellow ramp, serif titles, power-of-ten scale | white words | AI and maths explainers, 4x to 108x |
| `brief` | A black read-post: image card, short bold paragraphs, figures in cyan | white words | money briefs, 3.5x to 6x |
| `pills` | Near-black graph paper; headlines and list items as yellow and white pills | black on a yellow pill | business "why" shorts, 211x to 457x |
| `chat` | A messenger thread as the frame: avatar header, grey and blue bubbles, typing dots, the keyboard typing replies | black words | text-story shorts, 8x to 131x |
| `post` | A quiet repost frame on black: avatar, name, badge, a serif hook over a picture, the serif payoff under it | white serif | history reposts, 250x to 750x |
| `poster` | A dark textured cheat sheet: condensed capitals in white and yellow, icon rows split by yellow rules | white, yellow key words | psychology lists, 31x to 243x |
| `page` | A printed page under a lamp switching on: off-white paper, black serif, bold labels with one-line answers | black serif | book-page tips, about 50x |
| `street` | Talking-head footage around town (no cards): small white captions low, big keyword slams (spec `slams`) | small, low, white | course ad in this format |

Full research notes (clips, outlier ratios, colours sampled from frames) are in the Content department's
style research; `/hq:style` refreshes them.

## Cards

| Helper | Shows | Words |
| --- | --- | --- |
| `headline(gid, text, icons=, label=, pills=, kicker=, burst=)` | two app tiles joined by a line (mini reels burst out), the line inking in, check pills | own |
| `kicker_title(gid, kicker, title)` | small spaced kicker, big capitals, underline drawing | own |
| `question(gid, lead, big)` | a "?" disc, soft lead, big answer | own |
| `strike(gid, lead, wrong, right)` | the wrong idea struck through and greyed, the correction in a pill | own |
| `hub(gid, text, center=)` | a centre tile, rays out to floating mini reels | own |
| `comment_cta(gid, lead, keyword, reply=, after=)` | "Comment KEYWORD", a box that types and posts it, an auto-reply pill | own |
| `read_card(gid, paragraphs, art=)` | an image card, then short paragraphs fading in, figures in the accent | own |
| `chat_thread(gid, contact, messages)` | a messenger thread: their bubbles after typing dots, yours typed in first, the thread scrolling | own |
| `post_card(gid, name, handle, hook, payoff, media=, art=)` | a repost frame: avatar, badge, serif hook, a picture (your image file or a drawn scene), serif payoff | own |
| `cheat_sheet(gid, line1, line2, rows, footer=)` | condensed two-line title, icon rows ticking in, key words in the accent | own |
| `page_card(gid, caption, pairs)` | a caption bar, then bold serif labels with one-line answers | own |
| `equation(gid, a, b, result)` | icon + icon = result, popping in turn | Studio |
| `code_window(gid, title, lines, note=, thumbs=)` | code typing itself, mini reels sliding up | Studio |
| `ui_steps(gid, app, steps)` | an app walkthrough: dialogs per step, a hand-drawn arrow to the thing to click, typing, toggles | Studio |
| `counter_card(gid, title, value, tags=, items=)` | a repo-style card: a big number counting up, tags, a list | Studio |
| `stat_window(gid, title, stats, chart=, tag=)` | stat tiles counting up, a chart line drawing with a glowing head | Studio |
| `bars_window(gid, title, bars, values=)` | dim bars, then the accent bar growing | Studio |
| `list_window(gid, title, rows)` | rows ticking in, ticks and crosses | Studio |
| `lens(gid, word)` | rows of a word scrolling soft, a glass lens gliding over and showing them sharp | Studio |
| `big_number(gid, label, value, prefix=, suffix=, sub=)` | a huge number counting up, underline | Studio |
| `versus(gid, (title, points), (title, points))` | two cards, the right one lands second with an accent edge | Studio |
| `fan(gid, n=, badge=)` | phone screens fanning out in an arc, a badge | Studio |
| `with_chip(spec, n, total, label)` | any card with a "02 / 05  Label" chapter chip on top | |
| `kinetic(gid, text)` | kinetic type: letters rise out of a mask word by word on the voice, then a swell runs across (GSAP SplitText) | own |
| `morph(gid, [(shape, label)])` | one bold shape morphing star to bolt to house to tick (GSAP MorphSVG; shapes in `SHAPES`), a label each | own |
| `chart_morph(gid, title, labels, values, unit=, note=)` | bars grow, fold into points a line draws through, the peak gets a callout | Studio |
| `lottie_card(gid, file, caption=, loop=)` | a Lottie animation (LottieFiles free, or made with the text-to-lottie skill) seeked frame-accurately | own if captioned |
| `registry(gid, name, values, box=)` | **any of the 386 HyperFrames registry pieces** mounted in the themed card (`hf.sh catalog` lists them) | either |
| `annotate(gid, text, keyword, note=, style=)` | registry vox-annotate: a hand-drawn circle/highlight/underline on a keyword with a connector to a note | own |
| `sketch(gid, preset, caption=)` | registry whiteboard-ink: a bulb, flow or rocket sketch drawing itself with a pen nib | Studio |
| `flap_board(gid, text)` | registry split-flap-board: a departure board rolling to the words | own |
| `chart_race(gid, title, periods, series)` | registry bar-chart-race: ranked bars overtaking period by period | Studio |
| `ai_chat(gid, question, answer, bullets=, end=)` | registry ai-chat-reveal: a question typed and sent on a phone, the AI's answer streaming in | own |
| `notifications(gid, title, messages, app, headline=)` | registry notification-cascade: phone notifications stacking up over a desk | own |
| `proof_card(gid, brand, proof, cta, features)` | registry social-proof-card: a brand, a proof line, three feature pairs, a call to action | Studio |

Editorial cards (`kit_editorial.py`, `from kit_editorial import *` brings in the whole kit), re-implemented from
html-video's templates and the motion-skills packs (Apache-2.0 / MIT, sources named in the module):

| Helper | Shows | Words |
| --- | --- | --- |
| `chart_story(gid, title, values, labels=, mark=, note=, source=)` | news-style chart: gridlines rise, the line draws, the stretch after `mark` turns accent, a pointer note | Studio |
| `stat_anchor(gid, label, value, sub=, bars=, stats=)` | Swiss grid: a giant faint number behind, the figure rolling up, mini bars, side stats | Studio |
| `split_quote(gid, lines, who=, role=)` | an accent panel rises to a seam, quote lines rise through masks as said, payoff on the panel | own |
| `kinetic_lines(gid, lines)` | poster stack: each line sized to fill the column, rising on slight tilts | own |
| `flow_tree(gid, root, branches, pick=)` | decision tree: connectors draw, the picked path lights in the accent as it's said | Studio |
| `ranking(gid, title, rows, climb=)` | leaderboard: bars and figures on one curve; the accent row climbs to its rank | Studio |
| `donut(gid, value, label, total=, suffix=)` | a percentage ring with ticks, arc and figure on one curve | Studio |
| `timeline(gid, events, title=)` | a vertical spine growing node to node, each event landing on its spoken cue | Studio |

Motion rules every card should follow (eases, staggers, holds, chart order, safe zones, caption rules) are in
`MOTION.md`, with the places the kit still breaks them.

Icons: our two-tone set `doc chart chat cart coin bulb user mail play store clock camera flame folder spark`, plus
every **Lucide** icon by name (1,866, ISC, bundled in `icons/`; e.g. `rocket`, `shopping-cart`, `piggy-bank`). Accent words go in
braces: `"This tool makes {unlimited} reels"`. No em or en dashes anywhere (refused).

"Own" cards show the spoken words themselves (spec `captions: False`): put `"captions": false` on those
cutaways and Studio's captions step aside. Mixing own-word cards with Studio-caption cards gives the rhythm
the reference clips have.

## Use

```python
import sys; sys.path.insert(0, "<HQ>/templates/studio/themes")
from kit import *
G = {"hk": headline("hk", "This tool makes {unlimited} reels", icons=("doc", "spark")),
     "st": with_chip(stat_window("st", "Analytics", [("views", 742940)]), 1, 3, "Proof")}
write_cards(G, "anim-src", theme="gallery", durs={"hk": 3.4}, times={"hk": [("This", 0.0), ("tool", 0.21)]},
            handle="@yourbrand", title="Explained: Supermarkets")
```

Then in each card dir `npx --yes hyperframes@0.8.137 render . --fps 30 --quality high -o ../anim/hk.mp4`, and in
the Studio spec `"theme": "gallery"`, each card a `full: true` cutaway, `"captions": false` on own-word cards.
`durs` = each card's voice slot plus ~0.8 s (cards leave ~1 s before their end); `times` = the voice's words over
that card, in seconds from its start (words ink in as said); `title` = the letterbox title.

`python3 kit.py <outdir> <theme> [@handle]` writes the demo set (invented text) in a theme.

## Registry pieces and plugins

`registry()` copies a piece's files into the card and mounts it in the content band. Components take the theme's
colours and fonts through HyperFrames' design-contract tokens (`--fg`, `--brand`, `--accent`, `--font-display`),
which the kit maps from the theme and pins inside the mount; blocks keep their own look (scaled to the band if
they're landscape). Pieces with variables are the useful ones: read `registry/<kind>/<name>/registry-item.json`.
Many registry pieces are HyperFrames' own promos: `registry()` refuses a piece unless every variable whose
default names HyperFrames or HeyGen is set, and the wrappers fill every field (a blank field falls back to the
block's demo copy, so blanks are sent as a no-break space). A logo field gets a plain generated mark.
Cards that need GSAP's free bonus plugins list them (`plugins=["SplitText"]`), and the page loads only those.

## Free assets (checked 2026-10-06)

Commercial use, no credit needed, unless noted. Bundled: Lucide icons (ISC), the fonts above (OFL).

| For | Use | Licence and limits |
| --- | --- | --- |
| Icons | Lucide (bundled), Tabler Icons, Phosphor, Heroicons, Material Symbols | ISC / MIT / Apache |
| Emoji | Fluent Emoji (MIT), Noto Emoji (OFL) | Twemoji graphics need credit (CC BY); skip OpenMoji (share-alike) |
| Illustrations | unDraw (recolourable), Open Peeps and Humaaans (CC0) | unDraw forbids bulk download and AI training: fetch single files by hand |
| Animations | LottieFiles free animations (Lottie Simple License), or make one with the text-to-lottie skill | don't resell or redistribute the raw files |
| Sound effects | Kenney audio (CC0), Freesound with the CC0 filter only | Studio already synthesises its whoosh and impact |
| Music | Pixabay music (no credit) | Content ID claims on Instagram/TikTok are a known risk the licence doesn't cover |
| Brand logos | don't: Simple Icons are CC0 but the trademarks still apply | |

Avoid for anything public: Remotion-based code (company licence over 3 people), AGPL/GPL code (OpenMontage,
whisper-timestamped, typed.js, Piper), non-commercial voice models (F5-TTS weights, Fish Speech, Higgs Audio).

## Rules

- Formula, not someone's footage: the kit draws its own scenes, icons and mini reels. No creator's logo,
  handle, mascot, landmark or artwork, and no real brand marks on cards.
- Only the script's facts on cards; numbers come from the script and its sources.
- Content between y 300 and y 1280. Reserved ids are listed in `RESERVED` in `kit.py`.
- A theme's accent and caption ink must match its Studio theme (`tests/paper-kit.test.ts` checks).
- Fonts: SF and Georgia (system) plus OFL fonts in `fonts/` (Instrument Serif, Caveat, Comic Neue, Bebas Neue;
  licences in `fonts/licenses/`). A Studio theme whose `fontsDir` is `kit:fonts` reads them from there.

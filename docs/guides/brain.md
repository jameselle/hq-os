# The brain: what every department knows

HQ keeps two kinds of Obsidian brain, and every department reads them before it works and writes
to them after, so nothing is learned twice.

| Brain | Where | Holds |
|---|---|---|
| **HQ brain** | `~/hq-data/brain` | what's true for every business: playbooks, lessons that held up, decisions about how you work |
| **Business vault** | `~/hq-data/businesses/<slug>/vault` | that business's facts, decisions, lessons, playbooks and signals |

The HQ brain never holds a business's name, customers, numbers or accounts. HQ checks every note
written there and refuses one that names a business.

## Five kinds of note

Each brain has one folder per kind:

- **Facts:** what's true now (offer, prices, audience, brand voice, channels).
- **Decisions:** a rule someone decided, and why. The CEO's `CEO/Decisions` folder counts too.
- **Lessons:** something learned, with its evidence.
- **Playbooks:** how to do a job. Each department's `SOPs` folder counts too.
- **Signals:** a dated hand-off from one department to another, along the lines of the Workflows web.

## Who reads what

The Workflows page draws it: pick a department under **The brain**.

- Every department reads every decision and fact, its own lessons and those of the departments that
  feed it, its own playbooks, and the signals sent to it in the last 30 days.
- Every department writes its own facts, lessons and playbooks, and signals to the departments it feeds.
- The CEO reads everything and writes decisions.

## Commands

```bash
npm run hq -- brain init                       # make the HQ brain; add the folders to every vault
npm run hq -- brain read <slug> <dept>         # what that department should read, in order
echo '{"type":"lesson","dept":"content","title":"…","body":"…","evidence":["…"]}' | npm run hq -- brain write <slug> -
npm run hq -- brain show <slug>                # counts, and lessons waiting to move up
npm run hq -- brain promote <slug> "Lessons/2026-10-03 ….md" --title "…" --body rewritten.md
```

Skills do this for you: `/hq:dept`, `/hq:self-post`, `/hq:publish`, `/hq:clip`, `/hq:edit`,
`/hq:walkthrough`, `/hq:style` and `/hq:competitors` read first and write after.

## Moving a lesson up

The CEO review lists lessons worth sharing under **Decisions for you**, already rewritten without the
business's name. Say yes and it moves to the HQ brain (the business's note links up to it; the HQ copy never says which business it came from, and its evidence links stay behind); every business's departments
read it from then on. Facts and signals never move: they belong to one business.

## Writing by hand

Write in Obsidian as usual. A note dropped into `Lessons/` is a lesson even without a header; add
`dept: <department>` at the top so the right department reads it.

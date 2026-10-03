# The HQ brain: one shared brain plus one vault per business

Status: approved by the owner 2026-10-03 ("go and do it all end to end"). Approach A of three
(brain map in code + read/write commands; B was Obsidian conventions only, C was an embedding index).

## Goal

Every department reads the right knowledge before it works and writes what it learned after, so
nothing is re-learned; and a lesson learned in one business can help the others without any
business's private facts leaking into the others.

## Two brains

| Brain | Where | Holds | Never holds |
|---|---|---|---|
| **HQ brain** | `$HQ_DATA/brain/` (its own Obsidian vault, backed up with the rest of `$HQ_DATA`) | what is true across businesses: playbooks, lessons that held up, decisions about how the owner works, tool notes | any business's name, customers, numbers or accounts |
| **Business vault** | `$HQ_DATA/businesses/<slug>/vault/` (unchanged location) | that business's facts, decisions, lessons, playbooks, signals, plus the existing CEO reviews, plans and published-post notes | |

Both brains have the same five typed folders at their root:

| Type | Folder | What it is |
|---|---|---|
| fact | `Facts/` | what is true now (offer, prices, audience, brand voice, channels) |
| decision | `Decisions/` | a rule someone decided, and why |
| lesson | `Lessons/` | something learned, with evidence |
| playbook | `Playbooks/` | how to do a job, step by step |
| signal | `Signals/` | a dated hand-off from one department to another (the lines of the Workflows web) |

Legacy folders keep working and are read as typed notes: `CEO/Decisions/` = decisions owned by the
CEO; `Departments/<Label>/SOPs/` = playbooks owned by that department. Nothing is moved.

### Note header

YAML frontmatter, values JSON-encoded like the rest of HQ's notes:

`type`, `dept` (registry slug or `ceo`), `title`, `status` (`active` | `replaced`), `created`,
`updated`, `evidence` (list of links or paths), `to` (signals: list of department slugs),
`promoted` (HQ brain copy: the date; it never says which business it came from), `promoted_to` (business original: HQ brain path),
`business` (business notes only). Notes written by hand in Obsidian without a header still count:
type comes from the folder, department from the folder (SOPs) or `ceo`.

## The brain map (who reads and writes what)

Derived from the Workflows web (`EDGES`), so the brain and the workflows can't disagree:

- **Every department reads:** all active decisions and facts (business + HQ), its own lessons and
  the lessons of the departments that send it signals, its own playbooks, and signals addressed to it
  in the last 30 days.
- **Every department writes:** its own lessons, facts and playbooks, and signals to the departments
  its edges point at.
- **CEO** reads everything and writes decisions and signals to anyone.

`lib/brain.ts` (pure, client-safe) holds the types, folders, the map and the header parser/writer.

## Commands (`npm run hq -- brain …`)

- `brain init` creates the HQ brain and adds the five folders (with an index note each) to every
  business vault. Idempotent. New businesses get the folders from `templates/vault/`.
- `brain read <slug> <dept> [--chars N]` prints the reading bundle for that department, in order:
  decisions, facts (own department first), lessons (business, then HQ), playbooks, signals to it.
  Each note is trimmed to 1,500 characters; the bundle stops at the budget (default 12,000) and lists
  the titles it left out.
- `brain write <slug|hq> <note.json|->` files a note: `{type, dept, title, body, evidence?, to?}`.
  Facts, decisions and playbooks are named by title (writing again updates the note and keeps
  `created`); lessons and signals are dated. The HQ brain refuses any text naming a business.
- `brain promote <slug> <note-path> [--title T] [--body file]` copies a lesson, playbook or decision
  up to the HQ brain (optionally rewritten without business specifics). The business note links up to
  the copy; the copy drops evidence links and never says where it came from. Refuses if the HQ copy
  (header included) would name any business.
- `brain show <slug>` prints counts per type for both brains and the promotion candidates
  (active business lessons with evidence that aren't promoted yet).

## Skills

- `/hq:dept`, `/hq:self-post`, `/hq:publish`, `/hq:competitors`, `/hq:style`, `/hq:clip`,
  `/hq:edit`, `/hq:walkthrough`: step 0 runs `brain read`; the last step writes lessons and signals.
- `/hq:ceo`: reads `brain show`, proposes up to three promotions under "Decisions for you", and runs
  `brain promote` only after the owner's yes. The CEO also writes the week's decisions as decision notes.

## The visual (Workflows page, "The brain")

Server: `lib/brain-store.ts` counts notes per type in both brains and per department, and lists the
newest notes. Client: `components/BrainMap.tsx` draws the two brains side by side (five typed rows
each, with counts), a promote arrow from business to HQ for lessons, playbooks and decisions, and the
departments in two columns. Picking a department draws its reads (blue, brain to department) and
writes (green, department to brain) and lists its reading bundle's newest notes.

## Privacy

- The HQ brain is checked on every write and promotion against every business's name and slug
  (non-demo profiles), the same idea as the release leak check.
- The framework still names no business; demo data stays demo.

## Testing

`tests/brain.test.ts`: the map is derived from the edges and covers every department; header round
trip (including hand-written notes); read order and budget; write naming and update; HQ brain and
promotion refuse business names; legacy SOP and decision folders are read; init is idempotent.

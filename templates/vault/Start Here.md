---
type: index
business: "{{business}}"
created: "{{created}}"
---

# {{business}}

**What we sell:** {{offer}}
**Who buys:** {{audience}}

This vault is the company's memory. HQ (http://127.0.0.1:3150) and the `hq` Claude skills write into it; you can too.

## The brain
Every department reads before it works and writes what it learned after (`npm run hq -- brain read <slug> <dept>`).
- **Facts:** what's true now (offer, prices, audience, voice, channels).
- **Decisions:** a rule someone decided, and why. `CEO/Decisions` counts too.
- **Lessons:** something learned, with its evidence. The best move up to the shared **HQ brain** once you say yes.
- **Playbooks:** how to do a job. Each department's `SOPs` count too.
- **Signals:** a dated hand-off from one department to another.

## Where things live
- **CEO/Reviews:** every `/hq:ceo` review, dated. Read the newest first.
- **CEO/Decisions:** one note per decision, using `Templates/Decision`.
- **Departments/<name>:** what each department is for, its weekly plans (`/hq:dept <name>`) and its SOPs.
- **Sessions:** working-session logs, using `Templates/Session log`.

## Rules of the house
- Free tools only: open source first, free proprietary where it's better.
- Secrets never go in this vault. Keep keys in the tool that needs them.

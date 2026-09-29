---
type: index
business: "{{business}}"
created: "{{created}}"
---

# {{business}}

**What we sell:** {{offer}}
**Who buys:** {{audience}}

This vault is the company's memory. HQ (http://127.0.0.1:3150) and the `hq` Claude skills write into it; you can too.

## Where things live
- **CEO/Reviews:** every `/hq:ceo` review, dated. Read the newest first.
- **CEO/Decisions:** one note per decision, using `Templates/Decision`.
- **Departments/<name>:** what each department is for, its weekly plans (`/hq:dept <name>`) and its SOPs.
- **Sessions:** working-session logs, using `Templates/Session log`.

## Rules of the house
- Free tools only: open source first, free proprietary where it's better.
- Secrets never go in this vault. Keep keys in the tool that needs them.

# Design & Brand: set it up

> **If you are an AI walking an owner through this:** work top to bottom. Check what's already done before
> asking anything (`npm run hq -- doctor`, the department tab, `curl -s http://127.0.0.1:3150/api/status`).
> Ask the owner only for what only they can do: create an account, sign in, choose, approve a cost, approve a post.
> Never ask for a password, key or token in chat: they put secrets in the macOS Keychain themselves with the
> command given. Confirm each step worked before moving on, and finish with the "Done when" checklist.

**What this department does:** keeps the brand consistent and makes the graphics, UI and thumbnails.

**It covers:** brand kit and style; UI and product design; graphics and thumbnails; accessibility.

**Owner's time:** about 15 to 30 minutes: installing a design app or two, and approving the brand kit.
**Cost:** free. Figma's Starter plan limits projects and pages; Canva's free plan leaves out its brand kit and
many templates (those need Pro, so HQ keeps the brand kit itself).

## Before you start

- HQ is installed and running (see [Getting started](/guides/start-here)).
- A business is connected (`/hq:new-business`), and it's the current business in HQ's top bar.
- Whatever brand material the business already has: logo files (SVG or PNG), colours, fonts, a style guide, or
  just its website for Claude to read them from.
- Read [Private brand kits](/guides/brand-kits) for how HQ stores and shows a brand kit.

## 1. Tools

Installs go through `/hq:add-tool`: free tools only, from the official notarised download, a checksum-verified
release or source, never `curl | sh`, no Homebrew, no Docker on the Mac. Mac apps: the owner downloads the official
`.dmg` and drags the app to Applications. Web services: the owner signs up; Claude never signs up on their behalf.

### Figma (Starter) or Penpot

- **What it's for:** design and prototyping (UI, landing pages, thumbnails). **Figma (Starter)** is Figma's free
  plan; **Penpot** is the open-source alternative.
- **Needed or optional:** one of a group: one is enough. Figma is the usual pick if the owner already uses it;
  Penpot if they want open source.
- **Licence or plan:** Figma: free Starter plan (limits projects and pages). Penpot: MPL-2.0.
- **Set it up:** Figma: the owner signs up at https://www.figma.com and installs the official desktop app (or
  uses it in the browser). Penpot: use the free hosted version at penpot.app with the owner's own account, or
  self-host through `/hq:add-tool Penpot for design` (no Docker on the Mac, so only if it can be built from source;
  bind it to 127.0.0.1 and run it as an HQ service with `npm run hq -- services install`).
- **How HQ checks it:** Figma: the Figma app (**installed**), otherwise **web**. Penpot has no live check yet,
  so it always shows **missing**; that doesn't count against readiness when Figma is present.

### Canva (Free)

- **What it's for:** quick social graphics from templates.
- **Needed or optional:** listed as needed; a web service, so it's always available once the owner has an account.
- **Licence or plan:** free plan (proprietary). Its brand kit and many templates need Pro: don't rely on them.
- **Set it up:** the owner signs up at https://www.canva.com. Nothing to install.
- **How HQ checks it:** a free web service, shown as **web**.

### Inkscape

- **What it's for:** vector graphics and logos (an Illustrator alternative). Use it to clean up or export the logo
  as SVG and PNG for the brand kit.
- **Needed or optional:** needed.
- **Licence or plan:** open source, GPL-3.0.
- **Set it up:** `/hq:add-tool Inkscape for design`. The owner installs the official signed `.dmg` from
  inkscape.org by dragging it to Applications.
- **How HQ checks it:** the Inkscape app (**installed**).

### GIMP

- **What it's for:** photo editing (a Photoshop alternative): cut-outs, retouching, thumbnails.
- **Needed or optional:** needed.
- **Licence or plan:** open source, GPL-3.0.
- **Set it up:** `/hq:add-tool GIMP for design`. The owner installs the official `.dmg` from gimp.org by dragging
  it to Applications.
- **How HQ checks it:** an app named GIMP, GIMP-2.10 or GIMP 3 (**installed**).

## 2. Accounts and connections

No connections in HQ. Figma and Canva are the owner's own accounts, signed into in their own browser or app;
HQ stores nothing from them.

What HQ does keep is the business's **brand kit**, private to that business, in its HQ data folder (never in the
framework repository). Two files matter:

| File | What reads it | What's in it |
|---|---|---|
| `$HQ_DATA/businesses/<slug>/brand/kit.json` | the Design & Brand tab (and the email previews on Email & Lifecycle) | status, updated date, a Markdown guide, colour roles, the asset files, email previews |
| `$HQ_DATA/businesses/<slug>/brand.json` | HQ Studio's video renders ([Content & Social](/guides/content)) | caption font and colours, hook style, loudness, playback speed, cover style |

To build the kit:

1. Claude drafts it with `/small-business:brand-style` from what the business already has (its website, logo,
   any style guide), then shows the owner the colours and guide for a yes.
2. Save it as `brand/kit.json` with `"version": 1`. Each colour is a name, a `#RRGGBB` hex and a use. Each asset is
   a simple lowercase file name ending in `.svg`, `.png`, `.json`, `.md` or `.html`, placed in the same `brand/`
   folder and listed in the kit: only listed files can be downloaded. Put the long guide in `brand-guide.md` to
   make it downloadable.
3. Keep it synthetic where it touches people: no real customer data, credentials or signing tokens.
4. If the business makes videos, set the matching video look in `brand.json` (colours as `#RRGGBB`). `/hq:style`
   proposes changes here too, and asks the owner before changing the look.

## 3. Skills to use

- `/small-business:brand-style`: write the brand style guide. Start here.
- `/marketing:brand-review`: is this on-brand? Run it on any graphic, page or post before it goes out.
- `/design:design-critique`: structured feedback on a design.
- `/design:design-system`: audit or extend the design system.
- `/design:accessibility-review`: a WCAG check of a page or design.
- `/design:ux-copy`: buttons, errors and empty states.
- `/design:design-handoff`: specs for engineering ([Product & Engineering](/guides/engineering)).

This department has no `/hq:` skill of its own; `/hq:dept design` plans its week.

## 4. Check it's working

- The department tab (Design & Brand, then **Tools & Skills**) shows Figma (Starter) as **installed** or **web**,
  Canva (Free) as **web**, and Inkscape and GIMP as **installed**. Or from the terminal:
  `curl -s http://127.0.0.1:3150/api/status | jq '.departments[] | select(.slug=="design") | .tools[] | {name, state}'`.
- http://127.0.0.1:3150/design shows the business's palette on **Overview**, its guide on **Brand Guidelines**, and
  its logo files on **Asset Library**, each downloadable. "No brand kit connected for this business" means
  `kit.json` is missing or invalid.
- To check the kit from the terminal (in `~/business-os`):
  `npx tsx -e "import {readBrand} from './lib/brand'; console.log(readBrand('<slug>') ? 'kit ok' : 'no valid kit')"`
  prints `kit ok`.
- Switch to another business in the top bar: the Design tab shows that business's kit or the empty state, never
  this one's assets.
- The CEO tab shows no unresolved findings for this department. The CEO has no design-specific findings today;
  if the tab shows "skills alone" for Design & Brand, install a design app.

## Done when

- [ ] One of Figma (Starter) or Penpot is in use, and Inkscape and GIMP are installed.
- [ ] The owner has a Canva account, or has decided not to use one.
- [ ] `brand/kit.json` exists, validates (`kit ok`), and the owner approved its colours and guide.
- [ ] The logo is in the Asset Library as SVG and PNG, and downloads.
- [ ] If the business makes video: `brand.json` matches the kit's colours.
- [ ] The department tab shows **equipped**.

## Good to know

- The brand kit is private to its business and lives only in the HQ data folder. Never put a business's brand
  files in the framework repository.
- Email templates and their previews belong to [Email & Lifecycle](/guides/email); the Design tab's asset library
  is for images, vectors and tokens.
- Email previews in a browser aren't proof of how they look in Gmail or Outlook: test in real clients before any
  send.
- Use only fonts, photos and icons the business is licensed to use. Canva's free elements carry Canva's own
  licence terms.
- Run `/design:accessibility-review` on new pages: colour contrast from the palette is the usual failure.
- Text on graphics follows the caption rule: no em or en dashes.

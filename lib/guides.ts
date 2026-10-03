// How-to guides shown inside HQ (/guides), each one a doc in docs/guides/. They're written so an owner can
// follow them alone, or tell Claude "set up HQ" (/hq:setup) and be walked through them. Every department has
// one, generated from the registry so a new department can't ship without a guide (tests/guides.test.ts).
// Only listed docs can be opened, so a URL can never reach another file. Client-safe: no node imports.

import { DEPARTMENTS } from "./registry";

export type GuideKind = "start" | "department" | "page" | "connection";
export type Guide = { slug: string; title: string; blurb: string; file: string; kind: GuideKind; dept?: string };

export const GUIDE_KINDS: Record<GuideKind, string> = {
  start: "Start here",
  department: "Departments",
  page: "Pages",
  connection: "Connections",
};

const OTHER: Guide[] = [
  {
    slug: "start-here",
    kind: "start",
    title: "Getting started: install HQ and add a business",
    blurb: "From nothing to a running HQ with your business connected, backed up, and the order to set up each department.",
    file: "docs/guides/start-here.md",
  },
  {
    slug: "ceo",
    kind: "page",
    title: "The CEO tab and weekly reviews",
    blurb: "How the CEO ranks what needs you, what each kind of finding means, and how to get a review and a plan for the week.",
    file: "docs/guides/ceo.md",
  },
  {
    slug: "workflows",
    kind: "page",
    title: "Workflows: how the departments work together",
    blurb: "The levers (get, keep, expand customers), the hand-offs between departments, and how to run a workflow.",
    file: "docs/guides/workflows.md",
  },
  {
    slug: "scorecard",
    kind: "page",
    title: "How the growth scorecard works",
    blurb: "The adapter contract, every metric, how cost to win is worked out, and how private numbers stay private.",
    file: "docs/guides/scorecard.md",
  },
  {
    slug: "lifecycle",
    kind: "page",
    title: "Customer lifecycle",
    blurb: "Connecting a private lifecycle adapter: activation stages, email delivery and pause controls.",
    file: "docs/guides/lifecycle.md",
  },
  {
    slug: "brand-kits",
    kind: "page",
    title: "Brand kits",
    blurb: "Logos, colours, fonts and templates a business's posts and pages use.",
    file: "docs/guides/brand-kits.md",
  },
  {
    slug: "scorecard-billing",
    kind: "connection",
    title: "Connect Stripe and the App Store",
    blurb: "Read-only keys, step by step, so the scorecard shows real billing: paying members, MRR, cancellations, failed payments and members whose records disagree.",
    file: "docs/guides/scorecard-billing.md",
  },
  {
    slug: "scorecard-records",
    kind: "connection",
    title: "Connect your own records (Postgres or Supabase)",
    blurb: "Signups, activation and membership history from your own database, through a totals-only function and a hashed token.",
    file: "docs/guides/scorecard-records.md",
  },
];

export const GUIDES: Guide[] = [
  OTHER[0],
  ...DEPARTMENTS.map((d): Guide => ({ slug: d.slug, kind: "department", dept: d.slug, title: d.label, blurb: d.mission, file: `docs/guides/${d.slug}.md` })),
  ...OTHER.slice(1),
];

export const guideBySlug = (slug: string): Guide | null => GUIDES.find((g) => g.slug === slug) ?? null;
export const guideForDepartment = (dept: string): Guide | null => GUIDES.find((g) => g.kind === "department" && g.dept === dept) ?? null;

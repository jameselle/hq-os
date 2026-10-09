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
  {slug:"trend-radar-playbook",kind:"page",title:"Trend Radar playbook",blurb:"A practical three-route workflow: watch competitors, find small-creator breakouts, and collect Explore or For You ideas.",file:"docs/guides/trend-radar-playbook.md"},
  {slug:"trend-radar",kind:"page",title:"Trend Radar",blurb:"Discover recent videos, track growth and inspect niche signals with source evidence.",file:"docs/guides/trend-radar.md"},
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
    slug: "playbooks",
    kind: "page",
    title: "Playbooks: workflows HQ starts on its own",
    blurb: "Triggers from signals, schedules and the CEO's routing; a headless run writes the plan and drafts; you apply it; HQ judges the number two weeks later and files the lesson.",
    file: "docs/guides/playbooks.md",
  },
  {
    slug: "social",
    kind: "page",
    title: "Weekly social plan: every network, every week",
    blurb: "A channel plan per business, then each week's posts drafted from it and from what happened, with cards rendered, checked, approved and posted (by HQ or by hand).",
    file: "docs/guides/social.md",
  },
  {
    slug: "campaigns",
    kind: "page",
    title: "Campaigns: brief to results",
    blurb: "Plan a campaign with one goal and one number, tag every link, link its posts, blog posts and emails, and track what it cost and what it brought on the Campaigns page.",
    file: "docs/guides/campaigns.md",
  },
  {
    slug: "partners",
    kind: "page",
    title: "Partnerships: from found to live",
    blurb: "Find and screen creators, podcasts, newsletters and affiliates, draft outreach for the owner to send, link each partner to a campaign with its own tag, and see what it brought.",
    file: "docs/guides/partners.md",
  },
  {
    slug: "blog",
    kind: "page",
    title: "Daily blog: researched posts every day",
    blurb: "One post a day from real search demand and competitor gaps, checked (sources, claims, repeats) and published when you allow, then read back live.",
    file: "docs/guides/blog.md",
  },
  {
    slug: "workflow-setup",
    kind: "page",
    title: "Set up a workflow end to end",
    blurb: "Build a workflow, prove it runs (messages delivered or checks passed), measure it, and recipes for trials, cancel saves, annual offers, pricing tiers, comparison pages and free tools.",
    file: "docs/guides/workflow-setup.md",
  },
  {
    slug: "load-test",
    kind: "page",
    title: "Load testing: how many customers at once",
    blurb: "A stepped load test on a disposable copy of production: simulated customers by plan, what breaks first, the report HQ keeps and when the next one is due.",
    file: "docs/guides/load-test.md",
  },
  {
    slug: "brain",
    kind: "page",
    title: "The brain: what every department knows",
    blurb: "The shared HQ brain and each business's vault, the five kinds of note, who reads and writes what, and how a lesson moves up.",
    file: "docs/guides/brain.md",
  },
  {
    slug: "scorecard",
    kind: "page",
    title: "How the growth scorecard works",
    blurb: "The adapter contract, every metric, how cost to win is worked out, and how private numbers stay private.",
    file: "docs/guides/scorecard.md",
  },
  {
    slug: "analytics",
    kind: "page",
    title: "Analytics: every number, every workflow",
    blurb: "The number each workflow is judged by, where each one comes from, the analytics adapter contract and how to measure what's still missing.",
    file: "docs/guides/analytics.md",
  },
  {
    slug: "support-desk",
    kind: "page",
    title: "Support: who's waiting, what they ask, and where it goes next",
    blurb: "Conversations waiting for a reply, themes and where new customers get stuck, with no message text in HQ; the weekly themes go to Email, Data and Product.",
    file: "docs/guides/support-desk.md",
  },
  {
    slug: "finance-sync",
    kind: "connection",
    title: "Finance sync: the ledger fills itself from billing",
    blurb: "Daily totals from Stripe (or any billing) written into the ledger, checked, never doubled, feeding cost to win, margin and the CEO.",
    file: "docs/guides/finance-sync.md",
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

// The end-to-end flow of one campaign, from plan to paid partner: shown on Campaigns → How it works.
// Plain data so it can be tested (eight steps, each with who, where and done-when) and kept free of dashes.
// Client-safe: no node imports. Mirrors the HQ brain playbook "Tracking a campaign end to end".

export type FlowWho = "you" | "hq" | "claude";
export type FlowStep = { title: string; who: { who: FlowWho; label: string }[]; points: string[]; where: { label: string; href?: string }[]; done: string };

export const WHO_LABEL: Record<FlowWho, string> = { you: "You", hq: "HQ, automatically", claude: "Claude, when you ask" };

export const FLOW_STEPS: FlowStep[] = [
  { title: "Plan the campaign", who: [{ who: "you", label: "You decide" }, { who: "claude", label: "Claude sets up" }],
    points: ["Say what you want: the goal, who it's for, and the number that counts (new paying customers, or sign-ups if the product is free first).",
      "The campaign gets a tag, a target and an end date. Every link for it carries that tag."],
    where: [{ label: "Campaigns", href: "/campaigns" }], done: "The campaign shows as Live with a target." },
  { title: "Build the offer and the posts", who: [{ who: "claude", label: "Claude builds" }, { who: "you", label: "You approve" }],
    points: ["Optional special: a landing page that applies it automatically, for first-time customers only, with a closing date.",
      "Social posts, blog posts and emails are drafted with the tag on every link. You approve them in HQ.",
      "Approved Instagram and Pinterest posts go out by themselves on their day. You post X, TikTok and Discord."],
    where: [{ label: "Content & Social", href: "/content" }, { label: "SEO & GEO", href: "/seo" }, { label: "Email & Lifecycle", href: "/email" }],
    done: "The posts are approved and the first ones have their live links." },
  { title: "Find partners", who: [{ who: "claude", label: "Claude researches" }, { who: "you", label: "You shortlist" }],
    points: ["Creators, podcasts and newsletters found from public sources only, each with followers, fit and a compliance check.",
      "Anyone marked avoid is never contacted. Anyone marked check needs you to read the note first.",
      "Each partner gets their own tag under the campaign, so their customers count separately."],
    where: [{ label: "Partnerships", href: "/sales/partners" }], done: "About 10 partners are shortlisted." },
  { title: "Reach out", who: [{ who: "claude", label: "Claude drafts" }, { who: "you", label: "You approve or send" }, { who: "hq", label: "HQ emails" }],
    points: ["Email: click Approve. HQ sends it on a weekday, 9am to 5pm, at most 10 a day, with your name and an opt-out line.",
      "Instagram or a contact form: tap Copy and open, paste, send, then Mark as sent.",
      "No reply after 5 days: HQ drafts one follow-up for your yes. Never a second."],
    where: [{ label: "The partner's page in Partnerships", href: "/sales/partners" }], done: "Each shortlisted partner shows Contacted." },
  { title: "Replies and deals", who: [{ who: "you", label: "You" }],
    points: ["Replies land in your inbox. Move the partner along: Replied, then Negotiating, then Live.",
      "Record the deal: a fee per paying customer or a flat fee, kept under what a customer is worth to you.",
      "If someone says no thanks, click They opted out. HQ will never contact them again."],
    where: [{ label: "The partner's page", href: "/sales/partners" }], done: "The partner is Live and has their tracked link." },
  { title: "Customers come in", who: [{ who: "hq", label: "HQ counts" }],
    points: ["People click a tagged link, sign up and pay. The payment is tagged with the campaign.",
      "Every morning HQ reads the numbers and counts them by tag: the campaign's own, and each partner's.",
      "\"Not measured yet\" means HQ can't split that number by tag yet, and it says why. It never shows a made-up zero."],
    where: [{ label: "Data & Analytics", href: "/data" }], done: "Each campaign shows its numbers, or says what it needs." },
  { title: "See results", who: [{ who: "you", label: "You glance" }],
    points: ["The campaign page shows items out, sign-ups, paying customers, spend, cost per paying customer and progress to target.",
      "Each partner's page shows the customers they brought in."],
    where: [{ label: "Campaigns, then the campaign", href: "/campaigns" }], done: "You know which partners and posts are working." },
  { title: "Pay and review", who: [{ who: "you", label: "You" }, { who: "hq", label: "HQ checks the maths" }],
    points: ["Pay partners monthly. Payouts are recorded as partnership costs, so cost per customer stays honest.",
      "Keep partners whose customers are still paying after 90 days. Pause the rest.",
      "When the campaign ends, write down what worked. HQ keeps it for next time."],
    where: [{ label: "Finance", href: "/finance" }, { label: "CEO", href: "/ceo" }], done: "The campaign is marked Done with its learnings." },
];

export const FLOW_COUNTED = [
  { title: "Tagged link", text: "A post, email or partner link carries the campaign tag." },
  { title: "Visit", text: "They land on the site or the special's page." },
  { title: "Sign-up", text: "They create an account; the tag goes with them." },
  { title: "Pays", text: "The payment is tagged with the campaign." },
  { title: "Counted twice", text: "Once for the campaign, once for the partner who sent them." },
];

export const FLOW_RHYTHM = [
  { when: "Every hour", hq: "Posts approved social posts, sends approved emails, writes follow-up drafts", you: "Nothing" },
  { when: "Every morning", hq: "Reads the numbers and counts them by tag", you: "Nothing" },
  { when: "Twice a week", hq: "Lists what's waiting for you", you: "Approve posts, emails and follow-ups (about 5 minutes); send any DMs" },
  { when: "Every week", hq: "The CEO review sums up what moved", you: "Update partner replies; glance at each campaign's progress (about 10 minutes)" },
  { when: "Every month", hq: "Imports costs and works out cost per customer", you: "Pay partners; keep or pause each one" },
];

export const FLOW_STATUSES = {
  partner: ["Prospect", "Shortlisted", "Contacted", "Replied", "Negotiating", "Live"], partnerEnd: "Paused, Declined or Ended",
  partnerRule: "Avoid partners stay at Prospect forever. Going Live needs a clean compliance check and a tracked link.",
  message: ["Draft", "Approved", "Sent"], messageEnd: "One follow-up drafted after 5 days",
  messageRule: "HQ only ever sends emails you approved. Instagram messages and contact forms are always sent by you.",
};

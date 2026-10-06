// The analytics catalogue: every number a workflow is judged by, with the chart that shows it, which
// way is better, where it comes from and what a business must connect to measure it. The scorecard's
// headline numbers are part of it (same ids, read from the scorecard's weekly history); HQ measures a few
// from its own records; a private analytics adapter per business reports the rest (lib/analytics.ts).
// Client-safe: no node imports. Titles in WORKFLOW_ANALYTICS must match lib/workflows.ts (tests check).
import { METRICS, type MetricId } from "./scorecard-metrics";
import type { Lever } from "./workflows";

export type AUnit = "count" | "rate" | "money" | "months" | "days" | "minutes" | "ratio";
/** line: a weekly trend. bars: weekly counts. split: this period broken down by category. */
export type Chart = "line" | "bars" | "split";
/** scorecard: the scorecard's weekly history. hq: HQ's own records. adapter: the business's analytics adapter. */
export type Source = "scorecard" | "hq" | "adapter";

export type AnalyticsDef = {
  label: string; unit: AUnit; lever: Lever; chart: Chart; better: "up" | "down"; source: Source;
  /** The question the chart answers, in the owner's words. */
  question: string;
  /** What a business has to have, or connect, for this to be measured. */
  needs: string;
  /** An average or a per-item figure: its split rows are not pieces of one total. */
  average?: boolean;
  /** A fault count that should read zero: any reading above it becomes a CEO finding for the workflow's owner,
   *  with this as the action. */
  alarm?: string;
};

const sc = (id: MetricId, chart: Chart, better: "up" | "down", question: string, needs: string): AnalyticsDef =>
  ({ label: METRICS[id].label, unit: METRICS[id].unit, lever: METRICS[id].lever, chart, better, source: "scorecard", question, needs });
const SCORECARD_NEEDS = "A scorecard adapter that reports it (docs/guides/scorecard.md).";

export const ANALYTICS = {
  // ---------------------------------------------------------------- the scorecard's numbers
  new_signups: sc("new_signups", "bars", "up", "How many people signed up each week?", SCORECARD_NEEDS),
  new_paying: sc("new_paying", "bars", "up", "How many started paying each week?", SCORECARD_NEEDS),
  new_mrr: sc("new_mrr", "bars", "up", "How much monthly revenue did new customers add?", SCORECARD_NEEDS),
  activation_rate: sc("activation_rate", "line", "up", "What share of new sign-ups reached first value in week one?", SCORECARD_NEEDS),
  paying_churn_rate: sc("paying_churn_rate", "line", "down", "What share of paying customers stopped paying?", SCORECARD_NEEDS),
  failed_payments: sc("failed_payments", "bars", "down", "How many payments failed on the first try?", SCORECARD_NEEDS),
  payment_recovery_rate: sc("payment_recovery_rate", "line", "up", "What share of failed payments were recovered?", SCORECARD_NEEDS),
  set_to_cancel: sc("set_to_cancel", "line", "down", "How many paying customers have a cancellation scheduled?", SCORECARD_NEEDS),
  weekly_active_rate: sc("weekly_active_rate", "line", "up", "What share of paying customers used the product this week?", SCORECARD_NEEDS),
  upgrades: sc("upgrades", "bars", "up", "How many customers moved up a tier?", SCORECARD_NEEDS),
  downgrades: sc("downgrades", "bars", "down", "How many customers moved down a tier?", SCORECARD_NEEDS),
  nrr: sc("nrr", "line", "up", "Does revenue from existing customers grow or shrink?", SCORECARD_NEEDS),
  mrr: sc("mrr", "line", "up", "What is monthly recurring revenue?", SCORECARD_NEEDS),
  paying_customers: sc("paying_customers", "line", "up", "How many customers are paying?", SCORECARD_NEEDS),
  cost_to_win: sc("cost_to_win", "line", "down", "What does it cost to win one paying customer?", "Advertising and commission spend in the ledger, plus new paying customers."),
  payback_months: sc("payback_months", "line", "down", "How many months until a customer pays back what it cost to win them?", "Acquisition spend in the ledger, plus new MRR."),
  known_source_share: sc("known_source_share", "line", "up", "What share of new paying customers have a known source?", "First-touch attribution stored at sign-up."),
  records_mismatch: sc("records_mismatch", "line", "down", "Do billing and our own records agree?", SCORECARD_NEEDS),

  // ---------------------------------------------------------------- measured by HQ from its own records
  posts_published: { label: "Posts published", unit: "count", lever: "get", chart: "bars", better: "up", source: "hq",
    question: "How many posts went live each week, and where?", needs: "Posts logged with /hq:publish (read back from the platform)." },
  social_posts: { label: "Social posts published", unit: "count", lever: "get", chart: "bars", better: "up", source: "hq",
    question: "How many planned social posts went out?", needs: "The weekly social plan set up (npm run hq -- social setup), with posts marked posted." },
  blog_posts: { label: "Blog posts published", unit: "count", lever: "get", chart: "bars", better: "up", source: "hq",
    question: "How many researched posts went live?", needs: "The daily blog set up (npm run hq -- blog setup) with a publisher that reads posts back." },
  keyword_posts: { label: "Posts with a comment keyword", unit: "count", lever: "get", chart: "bars", better: "up", source: "hq",
    question: "How many posts asked viewers to comment a keyword?", needs: "Posts logged with /hq:publish whose caption asks for a keyword." },
  videos_edited: { label: "Videos edited in Studio", unit: "count", lever: "get", chart: "bars", better: "up", source: "hq",
    question: "How many videos and clips did HQ Studio finish each week?", needs: "Jobs run with /hq:edit, /hq:clip or /hq:self-post." },
  lifecycle_sent: { label: "Automated messages sent", unit: "count", lever: "keep", chart: "bars", better: "up", source: "hq",
    question: "How many automated messages (email, Discord, SMS) went out each week, and from which flow?", needs: "A lifecycle connection (docs/guides/lifecycle.md)." },
  ceo_reviews: { label: "CEO reviews", unit: "count", lever: "base", chart: "bars", better: "up", source: "hq",
    question: "Did the weekly review happen?", needs: "Reviews saved by /hq:ceo." },
  experiments_run: { label: "Experiments", unit: "count", lever: "base", chart: "split", better: "up", source: "hq",
    question: "How many tests were run, and how did they end?", needs: "Experiments logged with hq experiment add." },
  vault_notes: { label: "Brain notes", unit: "count", lever: "base", chart: "split", better: "up", source: "hq",
    question: "How much has the business written down (decisions, facts, lessons, playbooks)?", needs: "The business's Obsidian vault." },
  open_findings: { label: "Open CEO findings", unit: "count", lever: "base", chart: "line", better: "down", source: "hq",
    question: "How much is waiting on someone (the CEO's open findings)?", needs: "Nothing: HQ counts its own findings at each refresh." },
  campaigns_live: { label: "Campaigns live", unit: "count", lever: "get", chart: "split", better: "up", source: "hq",
    question: "How many marketing campaigns are running, and where is each one?", needs: "Campaigns recorded with hq campaign add (the Campaigns page)." },
  brand_kit_coverage: { label: "Brand kit complete", unit: "rate", lever: "base", chart: "line", better: "up", source: "hq",
    question: "How much of the brand kit is filled in?", needs: "A brand kit made with /hq:style or the Design tab." },
  workflow_checks_passing: { label: "Workflow checks passing", unit: "rate", lever: "base", chart: "line", better: "up", source: "hq",
    question: "What share of the live workflow checks pass?", needs: "A workflow-checks connection (docs/guides/lifecycle.md)." },

  // ---------------------------------------------------------------- Get customers (adapter)
  comparison_signups: { label: "Sign-ups from comparison pages", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many sign-ups came from \"X vs Y\" and \"alternative\" pages?", needs: "Landing page stored with each sign-up, and comparison pages to count." },
  organic_signups: { label: "Organic sign-ups", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many sign-ups came from search?", needs: "First-touch referrer stored with each sign-up." },
  search_clicks: { label: "Search clicks", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "How many clicks did search send to the site?", needs: "Search Console read access." },
  signups_by_source: { label: "Sign-ups by source", unit: "count", lever: "get", chart: "split", better: "up", source: "adapter",
    question: "Where did the last 4 weeks of sign-ups come from?", needs: "First-touch referrer or campaign stored with each sign-up." },
  followers: { label: "Followers", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "How many followers across channels?", needs: "Read access to each channel's account insights." },
  follows_per_post: { label: "Follows per post", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter", average: true,
    question: "How many follows does an average post bring?", needs: "Per-post insights (follows) from each channel." },
  views_per_post: { label: "Views per post", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter", average: true,
    question: "How many views does an average post get?", needs: "Per-post insights (views or plays) from each channel." },
  link_clicks: { label: "Link clicks", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many people clicked through from social to the site or repo?", needs: "Profile link clicks, or visits tagged by campaign." },
  walkthrough_coverage: { label: "Pages with a current walkthrough", unit: "rate", lever: "keep", chart: "line", better: "up", source: "adapter",
    question: "What share of pages have an up-to-date \"How it works\" video?", needs: "A list of pages and their walkthrough videos." },
  walkthrough_plays: { label: "Walkthrough plays", unit: "count", lever: "keep", chart: "bars", better: "up", source: "adapter",
    question: "How often are walkthrough videos played?", needs: "A play event on the walkthrough player." },
  keyword_dms: { label: "Keyword DMs sent", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many people commented the keyword and got the link?", needs: "The auto-DM tool's send log." },
  keyword_dm_delivery_rate: { label: "Keyword DMs delivered", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "Of the people sent the keyword DM, what share went on to get the link?", needs: "The auto-DM tool's send log." },
  keyword_dms_waiting: { label: "Waiting on a tap", unit: "count", lever: "get", chart: "split", better: "down", source: "adapter",
    question: "How many people have the keyword DM but haven't tapped it, or haven't followed yet?", needs: "The auto-DM tool's state, per campaign." },
  keyword_dm_misses: { label: "Keyword replies missed", unit: "count", lever: "get", chart: "bars", better: "down", source: "adapter",
    question: "Did anyone comment the keyword or reply to the DM and get nothing back?", needs: "The auto-DM tool recording each reply before it answers.",
    alarm: "Someone asked for the link and didn't get it. List them in the auto-DM tool, send each link by hand, mark them handled, and fix the cause." },
  dm_to_email_rate: { label: "DM to email", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of keyword DMs turned into an email address?", needs: "Email capture behind the DM link." },
  email_to_trial_rate: { label: "Email to trial", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of captured emails started a trial or signed up?", needs: "Captured emails matched to sign-ups." },
  partner_customers: { label: "Partner-sourced customers", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "How many paying customers came from partners or affiliates?", needs: "Partner or referral codes stored with each customer." },
  partner_d90_retention: { label: "Partner customers paying at day 90", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "Do partner-sourced customers stay?", needs: "Partner codes plus 90 days of billing history." },
  landing_conversion_rate: { label: "Landing page conversion", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of site visitors sign up?", needs: "Web analytics (visitors) plus sign-ups." },
  tool_users: { label: "Free tool users", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many people used the free tools?", needs: "A usage event on each free tool, logged in or not." },
  tool_signup_rate: { label: "Free tool users who sign up", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of free tool users went on to sign up?", needs: "Tool usage matched to later sign-ups." },
  feature_adoption: { label: "Feature adoption", unit: "rate", lever: "get", chart: "split", better: "up", source: "adapter",
    question: "What share of active customers used each feature in the last 4 weeks?", needs: "A usage event per feature." },
  ad_spend: { label: "Ad spend", unit: "money", lever: "get", chart: "bars", better: "down", source: "adapter",
    question: "How much was spent on ads each week?", needs: "Ad spend in the ledger or from the ad platform." },
  community_members: { label: "Community members", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "How big is the free community?", needs: "Member counts from the community platform." },
  community_paying: { label: "Community members who pay", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of community members are paying customers?", needs: "Community accounts linked to customer accounts." },
  referral_signups: { label: "Sign-ups from other sites", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many sign-ups came from links on other sites (press, AI answers, backlinks)?", needs: "First-touch referrer stored with each sign-up." },
  trial_to_paid_rate: { label: "Trial to paid", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of trials that ended became paying?", needs: "Trial start and end in billing." },
  checkouts_started: { label: "Checkouts started", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many people started a checkout?", needs: "A checkout-started event." },
  checkout_completion_rate: { label: "Checkouts completed", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of started checkouts were paid within 30 days?", needs: "A checkout-started event matched to payments." },
  visitor_to_paid_rate: { label: "Visitor to paid", unit: "rate", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "What share of pricing page visitors became paying?", needs: "Pricing page views plus new paying customers." },
  signups_by_market: { label: "Sign-ups by market", unit: "count", lever: "get", chart: "split", better: "up", source: "adapter",
    question: "Which markets or categories do new sign-ups use first?", needs: "First market or category used by each sign-up." },
  promo_redemptions: { label: "Promo code redemptions", unit: "count", lever: "get", chart: "split", better: "up", source: "adapter",
    question: "Which promo codes were used, and how often?", needs: "Promo codes on subscriptions or orders." },
  referral_customers: { label: "Customers from referrals", unit: "count", lever: "get", chart: "line", better: "up", source: "adapter",
    question: "How many customers came from a customer's referral?", needs: "Referral links with attribution." },
  sales: { label: "Sales", unit: "count", lever: "get", chart: "bars", better: "up", source: "adapter",
    question: "How many units sold each week?", needs: "Order or royalty reports from the store." },
  revenue: { label: "Revenue", unit: "money", lever: "base", chart: "bars", better: "up", source: "adapter",
    question: "How much revenue came in each week?", needs: "Orders, royalties or invoices from the store or billing." },

  // ---------------------------------------------------------------- Keep customers (adapter)
  time_to_activation: { label: "Days to first value", unit: "days", lever: "keep", chart: "line", better: "down", source: "adapter", average: true,
    question: "How long does a new customer take to reach first value (median)?", needs: "Sign-up time and the first core action." },
  at_risk_customers: { label: "At-risk customers", unit: "count", lever: "keep", chart: "line", better: "down", source: "adapter",
    question: "How many paying customers are flagged at risk?", needs: "A daily risk score or churn flag." },
  helped_churn_gap: { label: "Churn: helped vs not", unit: "rate", lever: "keep", chart: "line", better: "up", source: "adapter",
    question: "How much lower is churn for flagged customers who got help than for those who didn't (points)?", needs: "A holdout on the churn flow and its outcomes." },
  support_tickets: { label: "Support tickets", unit: "count", lever: "keep", chart: "split", better: "down", source: "adapter",
    question: "What are customers asking about, by theme?", needs: "Tagged tickets from the helpdesk or support inbox." },
  requests_closed: { label: "Requests closed", unit: "count", lever: "keep", chart: "bars", better: "up", source: "adapter",
    question: "How many customer requests were built and answered?", needs: "Requests tracked from ticket to release." },
  churn_to_rival: { label: "Churn to rivals", unit: "count", lever: "keep", chart: "split", better: "down", source: "adapter",
    question: "Which rivals are winning customers who leave?", needs: "A cancel reason that names the rival." },
  competitor_changes: { label: "Competitor changes seen", unit: "count", lever: "keep", chart: "bars", better: "up", source: "adapter",
    question: "How many rival page changes did the watcher catch?", needs: "Competitor watches in changedetection.io (/hq:competitors)." },
  incidents: { label: "Incidents", unit: "count", lever: "keep", chart: "bars", better: "down", source: "adapter",
    question: "How many outages or stale-data incidents were there?", needs: "An uptime monitor or data health checks with history." },
  stale_minutes: { label: "Minutes of stale data", unit: "minutes", lever: "keep", chart: "bars", better: "down", source: "adapter",
    question: "How long were customers looking at stale or missing data?", needs: "Data health checks with timestamps." },
  uptime_rate: { label: "Uptime", unit: "rate", lever: "keep", chart: "line", better: "up", source: "adapter",
    question: "What share of checks found the product up and fresh?", needs: "An uptime monitor or data health checks with history." },
  save_rate: { label: "Cancel save rate", unit: "rate", lever: "keep", chart: "line", better: "up", source: "adapter",
    question: "What share of people who started to cancel stayed?", needs: "A cancel flow that records starts, saves and cancels." },
  cancel_reasons: { label: "Cancel reasons", unit: "count", lever: "keep", chart: "split", better: "down", source: "adapter",
    question: "Why do customers cancel?", needs: "A reason asked at cancel." },
  reactivated: { label: "Reactivated customers", unit: "count", lever: "keep", chart: "bars", better: "up", source: "adapter",
    question: "How many former customers came back and paid again?", needs: "Billing history per customer." },
  bad_week_churn: { label: "Churn after a losing week", unit: "rate", lever: "keep", chart: "line", better: "down", source: "adapter",
    question: "Does churn rise after the track record has a bad week?", needs: "A graded track record plus weekly churn." },
  track_record: { label: "Track record", unit: "ratio", lever: "keep", chart: "line", better: "up", source: "adapter", average: true,
    question: "How did the published results do each week (return on stake)?", needs: "Every published result graded, losses included." },
  academy_activation: { label: "Activation of lesson viewers", unit: "rate", lever: "keep", chart: "line", better: "up", source: "adapter",
    question: "Do new customers who watch the lessons activate more?", needs: "A view event on lessons, matched to activation." },
  offseason_churn: { label: "Churn by season", unit: "rate", lever: "keep", chart: "split", better: "down", source: "adapter",
    question: "Is churn higher in off-season months?", needs: "Monthly churn history, at least a year." },
  paused_instead: { label: "Paused instead of cancelling", unit: "count", lever: "keep", chart: "bars", better: "up", source: "adapter",
    question: "How many customers paused their plan instead of cancelling?", needs: "A pause option (in the cancel flow or account settings) that records each pause." },
  releases: { label: "Releases", unit: "count", lever: "keep", chart: "bars", better: "up", source: "adapter",
    question: "How many changes shipped each week?", needs: "Merged pull requests or deploy logs." },
  customer_bugs: { label: "Bugs that reached customers", unit: "count", lever: "keep", chart: "bars", better: "down", source: "adapter",
    question: "How many fixes were for bugs customers could see?", needs: "Fixes labelled as customer-facing, or reverts and hotfixes." },
  top_customer_retention: { label: "Top customers still paying", unit: "rate", lever: "keep", chart: "line", better: "up", source: "adapter",
    question: "Of the top 10% by revenue a quarter ago, what share still pay?", needs: "Billing history per customer." },
  account_incidents: { label: "Account incidents", unit: "count", lever: "keep", chart: "bars", better: "down", source: "adapter",
    question: "How many account takeovers, abuse or security incidents?", needs: "Security logs or an incident log." },

  // ---------------------------------------------------------------- Expand revenue (adapter)
  upgrade_prompt_rate: { label: "Upgrades from in-product prompts", unit: "rate", lever: "expand", chart: "line", better: "up", source: "adapter",
    question: "What share of people who saw an upgrade prompt upgraded within 30 days?", needs: "A paywall-seen event matched to upgrades." },
  arpu: { label: "Revenue per paying customer", unit: "money", lever: "expand", chart: "line", better: "up", source: "adapter", average: true,
    question: "What does an average paying customer pay a month?", needs: "MRR and paying customers." },
  mrr_by_tier: { label: "MRR by tier", unit: "money", lever: "expand", chart: "split", better: "up", source: "adapter",
    question: "Which tiers and products bring the revenue?", needs: "Billing with a product per subscription." },
  annual_share: { label: "Customers on annual", unit: "rate", lever: "expand", chart: "line", better: "up", source: "adapter",
    question: "What share of paying customers are on an annual plan?", needs: "Billing interval per subscription." },
  addon_attach_rate: { label: "Add-on attach rate", unit: "rate", lever: "expand", chart: "line", better: "up", source: "adapter",
    question: "What share of paying customers buy an add-on?", needs: "Add-on products in billing." },
  b2b_mrr: { label: "B2B revenue", unit: "money", lever: "expand", chart: "line", better: "up", source: "adapter",
    question: "How much monthly revenue comes from teams, API and business plans?", needs: "B2B products in billing." },
  support_upgrades: { label: "Upgrades from support", unit: "count", lever: "expand", chart: "bars", better: "up", source: "adapter",
    question: "How many upgrades followed a support conversation?", needs: "Tickets tagged with an upgrade need, matched to upgrades." },
  price_change_net: { label: "Price change: revenue gained less churn", unit: "money", lever: "expand", chart: "line", better: "up", source: "adapter",
    question: "Did the last price change add more revenue than it lost?", needs: "A dated price change plus billing history." },
  cross_sell_customers: { label: "Customers of more than one business", unit: "count", lever: "expand", chart: "line", better: "up", source: "adapter",
    question: "How many customers pay more than one of your businesses?", needs: "Billing for each business on one account, matched by customer." },
  content_product_sales: { label: "Premium content sales", unit: "count", lever: "expand", chart: "bars", better: "up", source: "adapter",
    question: "How many courses, guides or extras sold to existing customers?", needs: "Those products in billing or the store." },

  // ---------------------------------------------------------------- Foundation (adapter)
  // Unit economics, worked out by HQ from the ledger and the scorecard for the last closed month (lib/unit-economics.ts).
  monthly_revenue: { label: "Revenue, last full month", unit: "money", lever: "base", chart: "line", better: "up", source: "hq",
    question: "How much revenue came in last month, after refunds?", needs: "Income in the ledger (a finance sync from billing, or entries by hand)." },
  monthly_costs: { label: "Costs, last full month", unit: "money", lever: "base", chart: "split", better: "down", source: "hq",
    question: "What did running the business cost last month, and which lines cost most?", needs: "Costs in the ledger (imported from the accounting system, or entries by hand)." },
  acquisition_spend: { label: "Acquisition spend, last full month", unit: "money", lever: "base", chart: "line", better: "down", source: "hq",
    question: "How much went on advertising, partners and commissions last month?", needs: "Advertising, Partnerships or Commissions costs in the ledger." },
  gross_margin: { label: "Gross margin", unit: "rate", lever: "base", chart: "line", better: "up", source: "hq",
    question: "What share of revenue is left after the direct cost of each sale (payment fees, cost of sales)?", needs: "Payment fees or cost of sales in the ledger." },
  net_margin: { label: "Net margin", unit: "rate", lever: "base", chart: "line", better: "up", source: "hq",
    question: "What share of revenue is left after every cost?", needs: "Income and costs in the ledger for the same month." },
  burn: { label: "Burn", unit: "money", lever: "base", chart: "line", better: "down", source: "hq",
    question: "How much more went out than came in last month (the net loss)?", needs: "Income and costs in the ledger for the same month." },
  cost_per_customer: { label: "Cost per paying customer", unit: "money", lever: "base", chart: "line", better: "down", source: "hq", average: true,
    question: "What does running the business cost per paying customer a month?", needs: "Costs in the ledger plus paying customers from the scorecard." },
  customer_lifetime: { label: "Customer lifetime", unit: "months", lever: "base", chart: "line", better: "up", source: "hq", average: true,
    question: "How many months does an average paying customer stay (1 / monthly churn)?", needs: "Weekly paying churn from the scorecard, at least 2 weeks of the month." },
  break_even_customers: { label: "Break-even paying customers", unit: "count", lever: "base", chart: "line", better: "down", source: "hq",
    question: "How many paying customers would cover last month's costs at today's revenue per customer?", needs: "Costs in the ledger plus MRR and paying customers from the scorecard." },
  ltv: { label: "Lifetime value", unit: "money", lever: "base", chart: "line", better: "up", source: "adapter", average: true,
    question: "What is a paying customer worth over their life (revenue per customer / churn)?", needs: "Revenue per customer and monthly churn." },
  ltv_to_cac: { label: "Lifetime value to cost to win", unit: "ratio", lever: "base", chart: "line", better: "up", source: "adapter",
    question: "Is a customer worth at least 3x what they cost to win?", needs: "Lifetime value plus acquisition spend." },
  complaints: { label: "Complaints and rejected claims", unit: "count", lever: "base", chart: "bars", better: "down", source: "adapter",
    question: "How many ads were rejected or complaints made about claims?", needs: "Ad platform review results and a complaints log." },
} as const satisfies Record<string, AnalyticsDef>;

export type AnalyticsId = keyof typeof ANALYTICS;
export const ANALYTICS_IDS = Object.keys(ANALYTICS) as AnalyticsId[];

/** The numbers each workflow is judged by, its main number first. Every workflow has at least one. */
export const WORKFLOW_ANALYTICS: Record<string, AnalyticsId[]> = {
  // Get customers
  "Competitor gap becomes comparison content": ["comparison_signups", "competitor_changes"],
  "Search demand becomes pages at scale": ["organic_signups", "search_clicks", "new_signups"],
  "Self post": ["posts_published", "follows_per_post", "views_per_post", "followers"],
  "Clip engine": ["videos_edited", "views_per_post", "follows_per_post"],
  "Walkthrough videos in the owner's voice": ["walkthrough_coverage", "walkthrough_plays"],
  "Weekly social plan from the channel plan": ["social_posts", "follows_per_post", "views_per_post", "link_clicks"],
  "Daily blog from search demand": ["blog_posts", "search_clicks", "organic_signups"],
  "Campaign from brief to results": ["new_signups", "campaigns_live", "ad_spend", "cost_to_win"],
  "Comment-keyword funnel": ["keyword_posts", "keyword_dms", "keyword_dm_delivery_rate", "keyword_dm_misses", "keyword_dms_waiting", "dm_to_email_rate", "email_to_trial_rate", "link_clicks"],
  "Partner program": ["partner_customers", "partner_d90_retention"],
  "Customer proof": ["landing_conversion_rate", "new_signups"],
  "Free tool as a lead magnet": ["tool_users", "tool_signup_rate"],
  "Launch week": ["new_signups", "feature_adoption", "sales"],
  "Paid ads with a payback cap": ["cost_to_win", "payback_months", "ad_spend"],
  "Community invites": ["community_members", "community_paying"],
  "Original data for press and AI answers": ["referral_signups", "signups_by_source"],
  "Trial that didn't convert": ["trial_to_paid_rate", "new_paying"],
  "Abandoned checkout recovery": ["checkouts_started", "checkout_completion_rate", "new_paying"],
  "Pricing page experiment": ["visitor_to_paid_rate", "new_paying", "new_mrr"],
  "New market or category": ["signups_by_market"],
  "Podcast and creator appearances": ["promo_redemptions"],
  "Referral program": ["referral_customers"],
  // Keep customers
  "Onboarding to first value": ["activation_rate", "time_to_activation"],
  "Churn early warning": ["paying_churn_rate", "at_risk_customers", "helped_churn_gap"],
  "Voice of the customer to roadmap": ["support_tickets", "requests_closed"],
  "Competitor move to product response": ["churn_to_rival", "competitor_changes"],
  "Data freshness and uptime": ["uptime_rate", "incidents", "stale_minutes"],
  "Failed payment recovery": ["payment_recovery_rate", "failed_payments"],
  "Cancel flow with saves": ["save_rate", "cancel_reasons", "set_to_cancel", "paying_churn_rate", "paused_instead"],
  "Win-back when the reason is fixed": ["reactivated"],
  "Daily habit": ["weekly_active_rate", "lifecycle_sent"],
  "Honest track record": ["track_record", "bad_week_churn"],
  "Customer academy": ["academy_activation"],
  "Off-season plan": ["offseason_churn", "paused_instead"],
  "Release quality gate": ["customer_bugs", "releases", "workflow_checks_passing"],
  "Top customer care": ["top_customer_retention"],
  "Exit survey to competitive intel": ["churn_to_rival"],
  "Account security and trust": ["account_incidents"],
  // Expand revenue
  "Usage limit to upgrade": ["upgrade_prompt_rate", "upgrades"],
  "Tier design": ["arpu", "mrr_by_tier", "nrr", "downgrades"],
  "Monthly to annual": ["annual_share"],
  "Add-ons": ["addon_attach_rate"],
  "Teams and B2B": ["b2b_mrr"],
  "Support conversation to upgrade": ["support_upgrades"],
  "Price increase without churn": ["price_change_net"],
  "Cross-sell across your businesses": ["cross_sell_customers"],
  "Premium content products": ["content_product_sales"],
  // Foundation
  "Weekly growth review": ["mrr", "paying_customers", "revenue", "ceo_reviews"],
  "Unit economics check": ["ltv_to_cac", "ltv", "cost_to_win", "payback_months", "break_even_customers", "burn", "monthly_revenue", "monthly_costs",
    "net_margin", "gross_margin", "arpu", "cost_per_customer", "customer_lifetime", "acquisition_spend"],
  "Measurement plumbing": ["known_source_share", "signups_by_source", "records_mismatch"],
  "Claims and compliance review": ["complaints"],
  "Brand system": ["brand_kit_coverage"],
  "Capacity and hiring": ["open_findings"],
  "Experiment log": ["experiments_run"],
  "Knowledge base and decisions": ["vault_notes"],
};

/** The workflows a metric serves, in catalogue order. */
export function workflowsUsing(id: AnalyticsId, titles: string[]): string[] {
  return titles.filter((t) => WORKFLOW_ANALYTICS[t]?.includes(id));
}

/** Format any analytics value. Money follows the business's currency; ratios read "2.4x". */
export function formatAnalytics(unit: AUnit, value: number | null, currency: string): string {
  if (value === null) return "—";
  if (unit === "rate") return `${(value * 100).toFixed(1)}%`;
  if (unit === "months") return `${value.toFixed(1)} mo`;
  if (unit === "days") return `${value.toFixed(value < 10 ? 1 : 0)} d`;
  if (unit === "minutes") return value >= 120 ? `${(value / 60).toFixed(1)} h` : `${Math.round(value)} min`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  if (unit === "money") {
    const dp = Math.abs(value) >= 100 ? 0 : 2;
    return new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: dp, maximumFractionDigits: dp }).format(value);
  }
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value);
}

/** Numbers that only mean something with recurring billing. For other business models they read "doesn't apply"
 *  unless an adapter reports them anyway. */
export const RECURRING_ONLY: AnalyticsId[] = [
  "new_mrr", "paying_churn_rate", "failed_payments", "payment_recovery_rate", "set_to_cancel", "weekly_active_rate",
  "upgrades", "downgrades", "nrr", "mrr", "records_mismatch", "trial_to_paid_rate", "save_rate", "cancel_reasons",
  "at_risk_customers", "helped_churn_gap", "reactivated", "bad_week_churn", "offseason_churn", "paused_instead", "top_customer_retention",
  "upgrade_prompt_rate", "arpu", "mrr_by_tier", "annual_share", "addon_attach_rate", "b2b_mrr", "support_upgrades",
  "price_change_net", "ltv", "ltv_to_cac", "payback_months", "customer_lifetime", "time_to_activation", "activation_rate",
];
export const isRecurring = (model: string) => model === "subscription" || model === "saas";

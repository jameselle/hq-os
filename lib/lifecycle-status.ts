// Plain answers about one automated flow, shared by the pages and the CLI: is it working, what's
// waiting for the owner (and when it expires), what to do next, and the week-one review with a
// "switch to auto / keep in draft / turn off" recommendation and its reason. Pure and client-safe:
// every date comes in as an argument, so tests pin the clock.
import type { LifecycleFlow, LifecycleSnapshot, LifecycleWorkflow } from "./lifecycle";
import { MIN_CALL, controlsFor, countOf, lift, pct, pts, windowDays, type Lift } from "./workflow-detail";

const DAY = 86400e3;
const key = (s: string) => s.trim().toLowerCase();
const has = (rows: { label: string }[], label: string) => rows.some((r) => key(r.label) === key(label));
const n = (x: number) => x.toLocaleString("en-AU");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

/** Short definitions, shown next to the word they explain. No glossary page. */
export const HINTS = {
  holdout: "A random share of the people who qualify get nothing, so the gap shows what the message itself changed.",
  notFair: "The people we didn't message differ in more than the message (they chose differently, or arrived at another time), so the gap is a hint, not proof.",
  lift: "Emailed minus held out, in percentage points: 30% vs 20% is +10 pts.",
  tooFew: `Each group needs at least ${MIN_CALL} people before a gap means anything. Until then it is noise.`,
  window: "We count it if they did it within this long of qualifying.",
  draft: "Each batch waits for your yes. Unapproved drafts expire.",
  auto: "Messages go out on their own. The holdout keeps measuring.",
  alwaysOn: "Sends on its own with no draft step. Pausing stops it.",
  off: "Nothing is planned or sent.",
  delivered: "The receiving mail server accepted it. Receipts arrive up to 30 minutes after sending.",
  noReceipt: "Sent, but no delivered or bounced receipt yet.",
  bounced: "The address doesn't exist or refused it. Bounced addresses never get another email.",
  complained: "They never get another email, and too many complaints hurt every email the business sends.",
  unsubscribed: "Clicked unsubscribe. They never get another email from this flow.",
  clicked: "Opened a link in the message.",
  replies: "Replies HQ can count. When it can't see the inbox it says so: check the sender's inbox.",
  expires: "A draft nobody approves in time is dropped, so stale news never goes out late.",
  inPart: "Some steps of this workflow run and are proven; the rest aren't built yet.",
  live: "Proven running: its own messages were delivered, or its checks passed, in the last 30 days.",
} as const;

// ---- dates (YYYY-MM-DD days are the business's own days; ISO times are formatted in its time zone)

export const addDays = (day: string, k: number) => new Date(Date.parse(day + "T00:00:00Z") + k * DAY).toISOString().slice(0, 10);
/** "Mon 12 Oct" */
export const dayLabel = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
/** "Tue 6 Oct, 4:12 pm" in the given zone. */
export function timeLabel(iso: string, tz?: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).replace(",", "");
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).replace(/\s/g, " ").toLowerCase();
  return `${date}, ${time}`;
}
/** Today's date where the business is. */
export const todayIn = (now: number, tz?: string) => new Date(now).toLocaleDateString("en-CA", { timeZone: tz });

// ---- facts

export type FlowFacts = {
  channel: LifecycleFlow["channel"]; noun: string;
  mode: "off" | "draft" | "auto" | null;
  today: string; since: string | null; firstSent: string | null; firstEntered: string | null;
  week: { entered: number; sent: number; skipped: number };
  all: { entered: number; sent: number; skipped: number; heldOut: number };
  lastSent: string | null;
  receipts: boolean;
  sent: number; delivered: number; noReceipt: number; bounced: number; complained: number; unsubscribed: number; failed: number; clicked: number;
  replies: number | null;
  drafts: { id: string; label: string; subject?: string; count: number; expiresAt: string | null }[];
  draftTotal: number; expiresAt: string | null;
};

export function flowFacts(flow: LifecycleFlow, controls: LifecycleWorkflow[], now: number, tz?: string): FlowFacts {
  const today = todayIn(now, tz);
  const days = [...flow.daily].sort((a, b) => a.day.localeCompare(b.day)).filter((d) => d.day <= today);
  const sum = (xs: typeof days) => xs.reduce((t, d) => ({ entered: t.entered + d.entered, sent: t.sent + d.sent, skipped: t.skipped + d.skipped }), { entered: 0, sent: 0, skipped: 0 });
  const week = sum(days.filter((d) => d.day > addDays(today, -7)));
  // From the day the flow says it started counting, when it says; else everything in view.
  const all = sum(flow.since ? days.filter((d) => d.day >= flow.since!) : days);
  const firstSent = days.find((d) => d.sent > 0)?.day ?? null;
  const firstEntered = days.find((d) => d.entered > 0)?.day ?? null;
  const c = (l: string) => countOf(flow.delivery, l);
  const sent = has(flow.delivery, "sent") ? c("sent") : all.sent;
  const receipts = has(flow.delivery, "delivered");
  const delivered = c("delivered"), bounced = c("bounced"), complained = c("complained"), failed = c("failed");
  const drafts = controls.filter((w) => (w.drafts ?? 0) > 0)
    .map((w) => ({ id: w.id, label: w.label, ...(w.preview?.subject ? { subject: w.preview.subject } : {}), count: w.drafts ?? 0, expiresAt: w.expiresAt ?? null }));
  const draftTotal = drafts.reduce((t, d) => t + d.count, 0);
  const expiresAt = drafts.map((d) => d.expiresAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  return {
    channel: flow.channel, noun: flow.channel === "email" ? "email" : "message",
    mode: flow.mode ?? null, today, since: flow.since ?? firstEntered ?? firstSent, firstSent, firstEntered,
    week, all: { ...all, heldOut: flow.holdoutPct ? Math.max(0, all.entered - all.sent - all.skipped - draftTotal) : 0 },
    lastSent: [...days].reverse().find((d) => d.sent > 0)?.day ?? null,
    receipts, sent, delivered, bounced, complained, failed,
    noReceipt: receipts ? Math.max(0, sent - delivered - bounced - complained) : 0,
    unsubscribed: c("unsubscribed"), clicked: c("clicked"),
    replies: flow.replies ?? null,
    drafts, draftTotal, expiresAt,
  };
}

// ---- outcomes, in words

export type OutcomeRead = {
  label: string; window: string; fair: boolean;
  emailed: { n: number; hit: number }; other: { n: number; hit: number } | null;
  lift: Lift | null; readsOn: string | null; text: string;
};

/** One outcome as a sentence, with the day its first reading lands when nobody has reached the window yet. */
export function readOutcome(flow: LifecycleFlow, o: LifecycleFlow["outcomes"][number], f: Pick<FlowFacts, "firstSent" | "firstEntered">): OutcomeRead {
  const fair = Boolean(flow.holdoutPct);
  const other = o.holdout ?? null;
  const w = windowDays(o.window);
  // Counted from the first message: nobody can reach the window before something was sent.
  const readsOn = f.firstSent && w !== null ? addDays(f.firstSent, Math.ceil(w)) : null;
  const l = lift(o.emailed, other);
  const rate = (p: { n: number; hit: number }) => `${pct(p.hit / p.n, 0)} of ${n(p.n)}`;
  const otherName = fair ? "held out" : "not messaged";
  let text: string;
  if (o.emailed.n === 0) {
    text = readsOn ? `No one messaged has reached ${o.window} yet. First reading ${dayLabel(readsOn)}.` : `No one messaged has reached ${o.window} yet. The first reading lands ${o.window} after the first message.`;
  } else if (!other) {
    text = `${rate(o.emailed)} messaged did it. Nothing to compare against.`;
  } else if (other.n === 0) {
    text = `${rate(o.emailed)} messaged did it. No one ${otherName} has reached ${o.window} yet, so there is nothing to compare against.`;
  } else if (!fair) {
    text = `${rate(o.emailed)} messaged vs ${rate(other)} not messaged. Not a fair test, so read it as a hint.`;
  } else if (l && !l.enough) {
    text = `${rate(o.emailed)} emailed vs ${rate(other)} held out (${pts(l)}). Too few to call: each group needs ${MIN_CALL}.`;
  } else {
    text = `${rate(o.emailed)} emailed vs ${rate(other)} held out: ${l ? pts(l) : "no gap"}.`;
  }
  return { label: o.label, window: o.window, fair, emailed: o.emailed, other, lift: l, readsOn, text };
}

// ---- the three questions

export type Tone = "good" | "warn" | "bad" | "idle";
export type Answer = { tone: Tone; headline: string; detail?: string };
export type Recommendation = { choice: "auto" | "draft" | "off" | "keep"; label: string; reason: string };
export type WeekOne = {
  startsOn: string | null; endsOn: string | null; ready: boolean;
  period: string;
  rows: { label: string; value: string; hint?: string; tone?: Tone }[];
  outcomes: OutcomeRead[];
  recommendation: Recommendation;
};
export type FlowStatus = {
  id: string; label: string; serves?: string; channel: LifecycleFlow["channel"];
  mode: FlowFacts["mode"]; modeWords: string;
  working: Answer; waiting: Answer; next: Answer;
  week: WeekOne; facts: FlowFacts;
};

/** `stale`: over 5 minutes old, too old to approve from. A read over a day old (or a failed one) can't say whether it works. */
export type StatusOpts = { now: number; tz?: string; stale?: boolean; failed?: boolean; observedAt?: string | null; canApprove?: boolean };
export const OLD_MS = DAY;

const MODE_WORDS = { off: "Off", draft: "Draft: waits for your yes", auto: "Auto: sends on its own", always: "Always on: no draft step" } as const;

function harm(f: FlowFacts) {
  const base = Math.max(f.delivered, f.sent - f.bounced, 1);
  const unsubRate = f.unsubscribed / base, bounceRate = f.sent ? f.bounced / f.sent : 0;
  // One bounce or one unsubscribe is not a pattern (bounced addresses are suppressed anyway); one spam complaint is.
  return { unsubRate, bounceRate, complained: f.complained > 0, unsubHigh: f.unsubscribed >= 2 && unsubRate > 0.05, bounceHigh: f.bounced >= 2 && f.sent >= 10 && bounceRate > 0.05 };
}

export function weekOne(flow: LifecycleFlow, f: FlowFacts, opts: StatusOpts): WeekOne {
  const startsOn = f.firstSent, endsOn = startsOn ? addDays(startsOn, 7) : null;
  const ready = Boolean(endsOn && f.today >= endsOn);
  const outcomes = flow.outcomes.map((o) => readOutcome(flow, o, f));
  const h = harm(f);
  const noun = f.noun;
  const period = !startsOn
    ? `Week one starts with the first ${noun} sent. Nothing has been sent yet.`
    : `First ${noun} sent ${dayLabel(startsOn)}; week one ${ready ? "ended" : "ends"} ${dayLabel(endsOn!)}. Counts below are everything since ${dayLabel(f.since ?? startsOn)}.`;
  const rows: WeekOne["rows"] = !f.sent ? [] : [
    { label: `${noun[0].toUpperCase()}${noun.slice(1)}s sent`, value: n(f.sent) },
    ...(f.receipts ? [
      { label: "Delivered", value: `${n(f.delivered)} of ${n(f.sent)}${f.noReceipt ? `, ${n(f.noReceipt)} no receipt yet` : ""}`, hint: HINTS.delivered },
      { label: "Bounced", value: n(f.bounced), hint: HINTS.bounced, tone: (h.bounceHigh ? "warn" : undefined) as Tone | undefined },
      { label: "Marked as spam", value: n(f.complained), hint: HINTS.complained, tone: (f.complained ? "bad" : undefined) as Tone | undefined },
    ] : [{ label: "Delivery receipts", value: `not reported for ${flow.channel}` }]),
    { label: "Unsubscribed", value: n(f.unsubscribed), hint: HINTS.unsubscribed, tone: h.unsubHigh ? "warn" : undefined },
    f.replies === null ? { label: "Replies", value: "HQ can't see the inbox: check the sender's replies" } : { label: "Replies", value: n(f.replies), hint: HINTS.replies },
  ];
  let recommendation: Recommendation;
  const harmReason = f.complained
    ? `${plural(f.complained, "person", "people")} marked it as spam.`
    : `${n(f.unsubscribed)} of ${n(f.delivered || f.sent)} unsubscribed (${pct(h.unsubRate, 0)}).`;
  const head = outcomes.find((o) => o.lift?.enough) ?? null;
  if (f.mode === "off") recommendation = { choice: "keep", label: "Leave it off", reason: "It's off, so there is nothing to review. Turn it back on in draft to restart week one." };
  else if (f.mode === null) {
    recommendation = h.complained || h.unsubHigh
      ? { choice: "off", label: "Pause it", reason: `${harmReason} It has no draft step, so pausing is the only way to stop it while the wording is fixed.` }
      : { choice: "keep", label: "Keep it on", reason: f.sent ? `${plural(f.sent, noun)} sent with no spam complaints${f.unsubscribed ? "" : " and no unsubscribes"}. It has no draft step to switch.` : `Nothing sent yet, so nothing to judge. It sends on its own once someone qualifies.` };
  } else if (!startsOn) recommendation = { choice: "draft", label: "Keep in draft", reason: `Nothing has been sent yet, so there is nothing to judge.` };
  else if (h.complained || h.unsubHigh) recommendation = { choice: "off", label: "Turn off", reason: `${harmReason} Fix the wording or the audience before anything else goes out.` };
  else if (!ready) recommendation = { choice: "draft", label: `Keep in draft until ${dayLabel(endsOn!)}`, reason: `Week one isn't over: ${plural(f.sent, noun)} sent so far.` };
  else if (f.sent < 5) recommendation = { choice: "draft", label: "Keep in draft another week", reason: `Only ${plural(f.sent, noun)} sent: too few to judge delivery or replies.` };
  else if (h.bounceHigh) recommendation = { choice: "draft", label: "Keep in draft", reason: `${n(f.bounced)} of ${n(f.sent)} bounced (${pct(h.bounceRate, 0)}). Bounced addresses are dropped automatically; approve one more batch by hand and check it lands.` };
  else if (head && head.lift!.pts < 0) recommendation = { choice: "off", label: "Turn off", reason: `People who got it did worse than the held-out group on "${head.label}" (${pts(head.lift!)}).` };
  else if (f.mode === "auto") recommendation = { choice: "keep", label: "Keep on auto", reason: `Clean so far: no spam complaints, ${pct(h.unsubRate, 0)} unsubscribed.` };
  else {
    const outcome = head ? `"${head.label}" is ${pts(head.lift!)} against the held-out group.` : "The outcome is still too few to call.";
    recommendation = { choice: "auto", label: "Switch to auto", reason: `Clean week one: ${n(f.sent)} sent, ${n(f.delivered)} delivered, no spam complaints, ${n(f.unsubscribed)} unsubscribed. ${outcome}${flow.holdoutPct ? ` The ${flow.holdoutPct}% holdout keeps measuring after the switch.` : ""}` };
  }
  return { startsOn, endsOn, ready, period, rows, outcomes, recommendation };
}

export function flowStatus(flow: LifecycleFlow, workflows: LifecycleWorkflow[], opts: StatusOpts): FlowStatus {
  const f = flowFacts(flow, controlsFor(flow, workflows), opts.now, opts.tz);
  const week = weekOne(flow, f, opts);
  const h = harm(f);
  const noun = f.noun;
  const modeWords = f.mode ? MODE_WORDS[f.mode] : MODE_WORDS.always;

  // Is it working?
  let working: Answer;
  const last = f.lastSent ? `last sent ${dayLabel(f.lastSent)}` : "nothing sent yet";
  const old = Boolean(opts.failed) || (opts.observedAt !== undefined && (!opts.observedAt || opts.now - Date.parse(opts.observedAt) > OLD_MS));
  if (old) working = { tone: "idle", headline: "Can't tell right now", detail: opts.failed ? "The last read failed. Refresh to try again." : `HQ's copy of these numbers is from ${opts.observedAt ? timeLabel(opts.observedAt, opts.tz) : "never"}. Refresh to read it again.` };
  else if (f.mode === "off") working = { tone: "idle", headline: "Off", detail: `Nothing is planned or sent. ${f.sent ? `It sent ${plural(f.sent, noun)} before it was turned off.` : ""}`.trim() };
  else if (f.week.sent > 0 && (h.complained || h.bounceHigh || h.unsubHigh))
    working = { tone: "warn", headline: "Sending, with a problem", detail: h.complained ? `${plural(f.complained, "spam complaint")} so far.` : h.bounceHigh ? `${n(f.bounced)} of ${n(f.sent)} bounced.` : `${n(f.unsubscribed)} of ${n(f.sent)} unsubscribed.` };
  else if (f.week.sent > 0) {
    const receipt = f.receipts ? ` ${n(f.delivered)} of ${n(f.sent)} delivered since ${dayLabel(f.since ?? f.firstSent!)}${f.noReceipt ? `, ${n(f.noReceipt)} awaiting a receipt` : ""}${f.bounced ? `, ${n(f.bounced)} bounced` : ""}.` : "";
    working = { tone: "good", headline: "Yes", detail: `${plural(f.week.sent, noun)} sent in the last 7 days.${receipt}` };
  } else if (f.draftTotal > 0) working = { tone: "warn", headline: "Waiting on you", detail: `${plural(f.draftTotal, "draft")} ready; none go out until you approve them.` };
  else if (f.week.entered > 0) {
    const who = `${plural(f.week.entered, "person", "people")} qualified in the last 7 days and nothing was sent`;
    const why = f.week.skipped ? `${n(f.week.skipped)} skipped: the reasons are under Skipped, below.` : flow.holdoutPct ? "They were held out, or aren't due yet." : "They aren't due yet or aren't eligible; the engine reports no reason.";
    working = f.week.entered >= 3 && !f.week.skipped
      ? { tone: "warn", headline: "Nothing sent this week", detail: `${who}. ${why}` }
      : { tone: "idle", headline: "Nobody due yet", detail: `${who}. ${why}` };
  } else if (f.sent > 0) working = { tone: "good", headline: "Yes, and quiet this week", detail: `Nobody qualified in the last 7 days; ${last}.` };
  else working = { tone: "idle", headline: "Not started", detail: `Nobody has qualified yet. Who qualifies: ${flow.trigger.charAt(0).toLowerCase()}${flow.trigger.slice(1)}.` };

  // What's waiting for me?
  const waiting: Answer = f.draftTotal
    ? { tone: "warn", headline: `${plural(f.draftTotal, "draft")} waiting for your yes`, detail: f.drafts.map((d) => `${d.label}: ${n(d.count)}${d.expiresAt ? `, expires ${timeLabel(d.expiresAt, opts.tz)}` : ""}`).join(" · ") }
    : f.mode === "draft"
      ? { tone: "idle", headline: "Nothing waiting", detail: "New drafts appear here when someone qualifies." }
      : { tone: "idle", headline: "Nothing waiting", detail: f.mode === "off" ? "It's off." : "It sends without asking you." };

  // What should I do next?
  let next: Answer;
  const firstRead = week.outcomes.map((o) => o.readsOn).filter((d): d is string => Boolean(d && d > f.today)).sort()[0];
  if (old) next = { tone: "warn", headline: "Refresh, then look again" };
  else if (f.draftTotal && opts.stale) next = { tone: "warn", headline: "Refresh, then approve", detail: `Approve only what you can see now.${f.expiresAt ? ` Anything not approved by ${timeLabel(f.expiresAt, opts.tz)} expires and is never sent.` : ""}` };
  else if (f.draftTotal) next = { tone: "warn", headline: opts.canApprove === false ? "Approve the drafts from the business's own tools" : "Read the email, then approve or leave it", detail: f.expiresAt ? `Anything not approved by ${timeLabel(f.expiresAt, opts.tz)} expires and is never sent.` : undefined };
  else if (working.tone === "warn" && f.week.sent > 0) next = { tone: "warn", headline: week.recommendation.label, detail: week.recommendation.reason };
  else if (week.ready && f.mode === "draft") next = { tone: "warn", headline: `Week one is done: ${week.recommendation.label.toLowerCase()}`, detail: week.recommendation.reason };
  else if (f.mode === "draft" && week.endsOn) next = { tone: "idle", headline: `Nothing until ${dayLabel(week.endsOn)}`, detail: `Then read the week-one review and decide: auto, draft or off.` };
  else if (f.mode === null && (h.complained || h.unsubHigh)) next = { tone: "warn", headline: week.recommendation.label, detail: week.recommendation.reason };
  else next = { tone: "idle", headline: "Nothing to do", detail: firstRead ? `The first outcome reading lands ${dayLabel(firstRead)}.` : f.mode === "off" ? "Turn it back on in draft when you want it running." : undefined };

  return { id: flow.id, label: flow.label, ...(flow.serves !== undefined ? { serves: flow.serves } : {}), channel: flow.channel, mode: f.mode, modeWords, working, waiting, next, week, facts: f };
}

/** Every flow's status, plus the short list of things that need the owner, most urgent first. */
export function lifecycleStatus(snapshot: LifecycleSnapshot | null | undefined, opts: StatusOpts) {
  const flows = (snapshot?.flows ?? []).map((f) => flowStatus(f, snapshot?.workflows ?? [], opts));
  const needs: { id: string; serves?: string; tone: Tone; text: string; at?: string | null }[] = [];
  for (const s of flows) {
    if (s.facts.draftTotal) needs.push({ id: s.id, serves: s.serves, tone: "warn", text: `${s.label}: ${s.waiting.headline}${s.facts.expiresAt ? `, first expiry ${timeLabel(s.facts.expiresAt, opts.tz)}` : ""}`, at: s.facts.expiresAt ?? "0" });
    else if (s.working.tone === "warn" || s.working.tone === "bad") needs.push({ id: s.id, serves: s.serves, tone: s.working.tone, text: `${s.label}: ${s.working.headline.toLowerCase()}. ${s.working.detail ?? ""}`.trim(), at: null });
    else if (s.week.ready && s.mode === "draft") needs.push({ id: s.id, serves: s.serves, tone: "warn", text: `${s.label}: week one is done. Recommendation: ${s.week.recommendation.label.toLowerCase()}.`, at: null });
  }
  needs.sort((a, b) => (a.at ?? "~").localeCompare(b.at ?? "~"));
  const upcoming = flows.filter((s) => s.mode === "draft" && s.week.endsOn && !s.week.ready).map((s) => ({ id: s.id, label: s.label, on: s.week.endsOn! })).sort((a, b) => a.on.localeCompare(b.on));
  return { flows, needs, upcoming };
}

/** The plain-text summary `hq lifecycle explain` prints and the skill reads. */
export function explainFlow(flow: LifecycleFlow, workflows: LifecycleWorkflow[], opts: StatusOpts & { business?: string }): string {
  const s = flowStatus(flow, workflows, opts);
  const f = s.facts, w = s.week;
  const lines = [
    `${s.label}${opts.business ? ` (${opts.business})` : ""}`,
    `Flow id: ${flow.id}. Serves the workflow "${flow.serves ?? "none"}". Channel: ${flow.channel}.`,
    `Who gets it: ${flow.trigger}`,
    `Mode: ${s.modeWords}.${flow.holdoutPct ? ` Holdout: ${flow.holdoutPct}% of the people who qualify get nothing, for comparison.` : " No holdout: comparisons are with people who weren't messaged, which is not a fair test."}`,
    `Messages: ${controlsFor(flow, workflows).map((m) => `${m.id} ("${m.preview?.subject ?? m.label}")`).join(", ") || "none reported"}`,
    "",
    `Is it working? ${s.working.headline}. ${s.working.detail ?? ""}`.trim(),
    `What's waiting? ${s.waiting.headline}. ${s.waiting.detail ?? ""}`.trim(),
    `What next? ${s.next.headline}. ${s.next.detail ?? ""}`.trim(),
    "",
    "Week one",
    w.period,
    ...w.rows.map((r) => `  ${r.label}: ${r.value}`),
    `  Qualified since ${f.since ? dayLabel(f.since) : "the start"}: ${n(f.all.entered)} (${n(f.all.sent)} sent, ${n(f.all.skipped)} skipped${flow.holdoutPct ? `, about ${n(f.all.heldOut)} held out` : ""}${f.draftTotal ? `, ${n(f.draftTotal)} waiting` : ""})`,
    ...flow.skips.map((k) => `  Skipped because ${k.label}: ${n(k.count)}`),
    "Outcomes",
    ...(w.outcomes.length ? w.outcomes.map((o) => `  ${o.label} within ${o.window}: ${o.text}`) : ["  None reported."]),
    `Recommendation: ${w.recommendation.label}. ${w.recommendation.reason}`,
  ];
  return lines.join("\n");
}

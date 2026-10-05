// Script check: does a talking-to-camera script make sense to a stranger, and does it fit?
// Reads a teleprompter script (`## Section` headings, spoken lines under them) and reports length, sentence
// length, reading grade, insider words with plain swaps, dashes and business names. Problems block; advice
// is for the writer. The method around it (viewer-first structure, cold-reader test) is /hq:script.

export type JargonHit = { term: string; swap: string; line: number };
export type ScriptReport = {
  words: number;
  sentences: number;
  spokenSeconds: number;
  postedSeconds: number;
  sections: string[];
  hook: string;
  grade: number;
  longSentences: { line: number; words: number; text: string }[];
  jargon: JargonHit[];
  problems: string[];
  advice: string[];
};
export type ScriptOptions = {
  /** Speaking pace before any speed-up, words a minute. */
  wpm?: number;
  /** Posting speed (the business's brand.json `speed`). */
  speed?: number;
  /** Target posted length in seconds; more than 20% over is a problem. */
  targetSeconds?: number;
  /** The comment keyword the ask must contain. */
  keyword?: string;
  /** Names that must never appear (other businesses). */
  names?: string[];
  /** Extra insider words for this business: { term: plain swap }. */
  jargon?: Record<string, string>;
};

/** Words a stranger scrolling past doesn't know, with what to say instead (or explain it in the same breath). */
export const JARGON: Record<string, string> = {
  workflow: "a job the business does on repeat (say what it is: 'the emails that welcome new customers')",
  workflows: "the jobs that grow the business (name one or two)",
  flow: "an automatic email, or name it ('the welcome email')",
  flows: "automatic emails (name them)",
  lifecycle: "the emails that go out on their own",
  holdout: "a group that gets nothing, so you can compare",
  cohort: "group of people who signed up the same week",
  activation: "people who actually used it",
  activated: "actually used it",
  churn: "people who cancel",
  mrr: "monthly revenue",
  arr: "yearly revenue",
  kpi: "number",
  kpis: "numbers",
  metric: "number",
  metrics: "numbers",
  funnel: "the steps to buying",
  conversion: "people who buy",
  onboarding: "the first emails a new customer gets",
  adapter: "a link to",
  connector: "a link to",
  pipeline: "the steps it goes through",
  scorecard: "the page of numbers",
  lever: "way to grow",
  levers: "ways to grow",
  sop: "written steps",
  integration: "a link between two tools",
  "data tab": "say what it is: 'one page with all my numbers'",
};

const DASHES = /[–—]/;
const spokenLines = (text: string) =>
  text.split("\n").map((t, i) => ({ t: t.trim(), line: i + 1 })).filter((l) => l.t && !l.t.startsWith("#"));

export function splitSentences(s: string): string[] {
  return s.split(/(?<=[.!?]["”']?)\s+/).map((x) => x.trim()).filter(Boolean);
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

const wordsOf = (s: string) => s.split(/\s+/).filter((w) => /[a-z0-9$%]/i.test(w));

export function checkScript(text: string, o: ScriptOptions = {}): ScriptReport {
  const wpm = o.wpm ?? 175;
  const speed = o.speed ?? 1;
  const lines = spokenLines(text);
  const sections = text.split("\n").filter((t) => t.trim().startsWith("## ")).map((t) => t.trim().slice(3));
  const sents: { text: string; line: number }[] = [];
  for (const l of lines) for (const s of splitSentences(l.t)) sents.push({ text: s, line: l.line });
  const allWords = sents.flatMap((s) => wordsOf(s.text));
  const words = allWords.length;
  const spokenSeconds = Math.round((words / wpm) * 600) / 10;
  const postedSeconds = Math.round((spokenSeconds / speed) * 10) / 10;
  const syl = allWords.reduce((n, w) => n + syllables(w), 0);
  const grade = sents.length && words ? Math.round((0.39 * (words / sents.length) + 11.8 * (syl / words) - 15.59) * 10) / 10 : 0;
  const longSentences = sents.map((s) => ({ line: s.line, words: wordsOf(s.text).length, text: s.text })).filter((s) => s.words > 14);
  const hook = sents[0]?.text ?? "";

  const dict = { ...JARGON, ...Object.fromEntries(Object.entries(o.jargon ?? {}).map(([k, v]) => [k.toLowerCase(), v])) };
  const jargon: JargonHit[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const low = l.t.toLowerCase();
    for (const [term, swap] of Object.entries(dict)) {
      if (seen.has(term)) continue;
      const re = new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
      if (re.test(low)) { jargon.push({ term, swap, line: l.line }); seen.add(term); }
    }
  }

  const problems: string[] = [];
  const advice: string[] = [];
  lines.forEach((l) => { if (DASHES.test(l.t)) problems.push(`line ${l.line}: an em or en dash`); });
  const low = text.toLowerCase();
  const names = (o.names ?? []).filter((n) => n.length >= 3 && low.includes(n.toLowerCase()));
  if (names.length) problems.push(`names a business: ${names.join(", ")}`);
  if (o.targetSeconds && postedSeconds > o.targetSeconds * 1.2)
    problems.push(`${postedSeconds} s posted vs a ${o.targetSeconds} s target: cut about ${Math.ceil((postedSeconds - o.targetSeconds) * speed * wpm / 60)} words`);
  if (o.keyword && !new RegExp(`\\b${o.keyword}\\b`).test(text)) problems.push(`the ask never says the keyword ${o.keyword}`);
  const hookWords = wordsOf(hook).length;
  if (hookWords > 14) problems.push(`the first sentence is ${hookWords} words: a stranger decides in about 2 seconds, keep it to 14`);
  for (const s of longSentences) if (s.words > 20) problems.push(`line ${s.line}: ${s.words}-word sentence, split it`);

  for (const s of longSentences) if (s.words <= 20) advice.push(`line ${s.line}: ${s.words} words, say it in two`);
  if (grade > 7) advice.push(`reading grade ${grade}: shorter words and sentences (aim for 6 or under)`);
  for (const j of jargon) advice.push(`line ${j.line}: "${j.term}" means nothing to a stranger: ${j.swap}, or explain it in the same breath`);
  if (!/\byou\b|\byour\b/i.test(text)) advice.push("never says 'you': tell the viewer what's in it for them");

  return { words, sentences: sents.length, spokenSeconds, postedSeconds, sections, hook, grade, longSentences, jargon, problems, advice };
}

export function formatReport(r: ScriptReport): string {
  const out = [
    `${r.words} words, ${r.sentences} sentences, ${r.sections.length} sections`,
    `about ${r.spokenSeconds} s spoken, ${r.postedSeconds} s posted · reading grade ${r.grade}`,
    `hook: ${r.hook}`,
  ];
  if (r.problems.length) out.push("", "PROBLEMS (fix before recording):", ...r.problems.map((p) => `  ✗ ${p}`));
  if (r.advice.length) out.push("", "ADVICE:", ...r.advice.map((a) => `  · ${a}`));
  out.push("", r.problems.length ? "FAIL" : "PASS");
  return out.join("\n");
}

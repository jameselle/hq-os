// HQ load-test template: turn one run folder into report.json (the contract `npm run hq -- loadtest record` reads)
// and report.md. The folder holds: meta.json ({"steps":"10,25,50,100","ramp":"1m","hold":"10m","startedAt":<unix s>,
// "commit":"<sha>"}), k6.csv.gz (k6 --out csv), and optionally samples.csv (sample-server.sh) and jobs.jsonl (one
// JSON line per background-job run: {"startedAt":"<ISO>","wallMs":N}).
//   PRIMARY=catalogue node report.mjs <run folder>
// Each step is judged on its hold only (after the ramp). Edit CRITERIA to the business's own pass bar.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CRITERIA = { primaryP95Ms: 2000, errorRate: 0.01, memAvailMinMb: 400, healthP95Ms: 1000, jobWallMaxMs: 120_000 };

export function seconds(d) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(d).trim());
  if (!m) throw new Error(`bad duration ${d}`);
  return Number(m[1]) * { ms: 0.001, s: 1, m: 60, h: 3600 }[m[2]];
}

export function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(s.length * p) - 1)]; };
const max = (xs) => (xs.length ? Math.max(...xs) : null);
const min = (xs) => (xs.length ? Math.min(...xs) : null);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r0 = (x) => (x === null ? null : Math.round(x));

export function windows(meta, t0) {
  const ramp = seconds(meta.ramp), hold = seconds(meta.hold);
  return String(meta.steps).split(",").map(Number).map((users, i) => { const from = t0 + i * (ramp + hold) + ramp; return { users, from, to: from + hold }; });
}

export function summarise({ meta, k6Rows, samples = [], jobs = [], primary }) {
  const t0 = min(k6Rows.map((r) => Number(r.timestamp)));
  return windows(meta, t0).map((w) => {
    const inW = (t) => t >= w.from && t < w.to;
    const rows = k6Rows.filter((r) => inW(Number(r.timestamp)));
    const reqs = rows.filter((r) => r.metric_name === "http_reqs");
    const durs = rows.filter((r) => r.metric_name === "http_req_duration");
    const endpoints = {};
    for (const name of [...new Set(durs.map((r) => r.name))].sort()) {
      const ms = durs.filter((r) => r.name === name).map((r) => Number(r.metric_value));
      endpoints[name] = { n: ms.length, p50: r0(pct(ms, 0.5)), p95: r0(pct(ms, 0.95)), p99: r0(pct(ms, 0.99)), max: r0(max(ms)) };
    }
    const status = {};
    for (const r of reqs) status[r.status] = (status[r.status] ?? 0) + 1;
    const errors = reqs.filter((r) => r.status === "0" || Number(r.status) >= 500).length;
    const notOk = reqs.filter((r) => r.status !== "200").length;
    const streamErrors = rows.filter((r) => r.metric_name === "stream_errors").length;
    const s = samples.filter((x) => inW(Number(x.ts)));
    const col = (c) => s.map((x) => Number(x[c])).filter(Number.isFinite);
    const box = { cpuAvg: r0(avg(col("cpu_busy_pct"))), cpuP95: r0(pct(col("cpu_busy_pct"), 0.95)), memAvailMinMb: min(col("mem_avail_mb")),
      swapMaxMb: max(col("swap_used_mb")), appRssMaxMb: max(col("api_rss_mb")), redisMaxMb: max(col("redis_used_mb")),
      pgConnsMax: max(col("pg_conns")), healthP95Ms: r0(pct(col("health_ms"), 0.95)) };
    const runs = jobs.filter((j) => inW(Date.parse(j.startedAt) / 1000));
    const jobWallMaxMs = max(runs.map((j) => j.wallMs));
    const p95 = primary ? endpoints[primary]?.p95 ?? null : max(Object.values(endpoints).map((e) => e.p95));
    const fails = [];
    if (p95 === null) fails.push(`no ${primary ?? "requests"} measured`);
    else if (p95 >= CRITERIA.primaryP95Ms) fails.push(`${primary ?? "slowest endpoint"} p95 ${p95} ms`);
    if (errors) fails.push(`${errors} server errors or dropped connections`);
    if (reqs.length && notOk / reqs.length >= CRITERIA.errorRate) fails.push(`${(100 * notOk / reqs.length).toFixed(1)}% of requests not 200`);
    if (box.memAvailMinMb !== null && box.memAvailMinMb < CRITERIA.memAvailMinMb) fails.push(`memory available fell to ${box.memAvailMinMb} MB`);
    if (box.healthP95Ms !== null && box.healthP95Ms >= CRITERIA.healthP95Ms) fails.push(`health check p95 ${box.healthP95Ms} ms`);
    if (jobWallMaxMs !== null && jobWallMaxMs >= CRITERIA.jobWallMaxMs) fails.push(`a background job run took ${Math.round(jobWallMaxMs / 1000)} s`);
    if (streamErrors) fails.push(`${streamErrors} stream errors`);
    return { users: w.users, pass: fails.length === 0, fails, rps: +(reqs.length / (w.to - w.from)).toFixed(2), requests: reqs.length, status, errors, endpoints, box, jobs: { runs: runs.length, wallMaxMs: jobWallMaxMs } };
  });
}

const f = (v, unit = "") => (v === null || v === undefined ? "-" : `${v}${unit}`);
export function markdown(meta, steps, primary) {
  const L = [`# Load test ${new Date(meta.startedAt * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`, "",
    `Steps ${meta.steps} customers, ramp ${meta.ramp}, hold ${meta.hold}. Only each hold is judged.${meta.commit ? ` Commit ${meta.commit}.` : ""}`, "",
    `| Customers | Verdict | Req/s | ${primary ?? "Slowest"} p95 | Non-200 | CPU avg | Mem free min | Swap max | Health p95 | Why |`, "|---|---|---|---|---|---|---|---|---|---|"];
  for (const s of steps) {
    const p95 = primary ? s.endpoints[primary]?.p95 : max(Object.values(s.endpoints).map((e) => e.p95));
    const non200 = Object.entries(s.status).filter(([k]) => k !== "200").map(([k, v]) => `${v}x${k}`).join(" ") || "0";
    L.push(`| ${s.users} | ${s.pass ? "PASS" : "FAIL"} | ${s.rps} | ${f(p95, " ms")} | ${non200} | ${f(s.box.cpuAvg, "%")} | ${f(s.box.memAvailMinMb, " MB")} | ${f(s.box.swapMaxMb, " MB")} | ${f(s.box.healthP95Ms, " ms")} | ${s.fails.join("; ")} |`);
  }
  for (const s of steps) {
    L.push("", `## ${s.users} customers: ${s.pass ? "PASS" : "FAIL"}`, "", "| Endpoint | n | p50 | p95 | p99 | max |", "|---|---|---|---|---|---|");
    for (const [n, v] of Object.entries(s.endpoints)) L.push(`| ${n} | ${v.n} | ${v.p50} | ${v.p95} | ${v.p99} | ${v.max} |`);
  }
  return L.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: PRIMARY=<endpoint> node report.mjs <run folder>"); process.exit(2); }
  const primary = process.env.PRIMARY || undefined;
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const k6Rows = parseCsv(gunzipSync(readFileSync(join(dir, "k6.csv.gz"))).toString("utf8"));
  const samples = existsSync(join(dir, "samples.csv")) ? parseCsv(readFileSync(join(dir, "samples.csv"), "utf8")) : [];
  const jobs = existsSync(join(dir, "jobs.jsonl")) ? readFileSync(join(dir, "jobs.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const steps = summarise({ meta, k6Rows, samples, jobs, primary });
  writeFileSync(join(dir, "report.json"), JSON.stringify({ meta, criteria: CRITERIA, steps }, null, 2));
  writeFileSync(join(dir, "report.md"), markdown(meta, steps, primary));
  for (const s of steps) console.log(`${String(s.users).padStart(5)} customers  ${s.pass ? "PASS" : "FAIL"}  ${s.rps} req/s  ${s.fails.join("; ")}`);
}

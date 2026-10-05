#!/usr/bin/env node
// HQ's template workflow-checks adapter: proof for workflows that send nothing (pages, measurement).
// It reads a checks file and answers pass or fail per check from public pages, or from numbers HQ already
// measured for the business (its analytics snapshot): no credentials, no customer data. Copy it to $HQ_DATA/businesses/<slug>/workflow-checks.mjs and point
// workflow-checks-connection.json at it, with the checks file as the argument:
//   {"readOnly":true,"command":["/path/to/node","/path/to/workflow-checks.mjs","/path/to/checks.json"]}
//
// checks.json:
//   {"site":"https://example.com","workflows":[{"title":"<workflow title from HQ>","checks":[
//     {"label":"Pricing page answers the common questions","path":"/pricing/","contains":["Frequently asked"]},
//     {"label":"Sitemap lists the guides","path":"/sitemap.xml","count":"/guides/[a-z0-9-]+/","atLeast":10},
//     {"label":"Uptime at least 99% last week","metric":"uptime_rate","atLeast":0.99},
//     {"label":"Down under an hour last week","metric":"stale_minutes","below":60},
//     {"label":"Free-tool users are counted","metric":"tool_users"}]}]}
//   "analytics" (optional) is the path of the business's analytics-snapshot.json; it defaults to the one beside
//   checks.json. A metric check passes when HQ measured the number (and it meets atLeast / below if given).
//
// stdout: {"version":1,"observedAt":ISO,"workflows":[{"title":…,"checks":[{"label":…,"ok":bool,"detail":…}]}]}
// HQ marks a workflow live only when every one of its checks passed in the last 8 days.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runChecks(config, fetchText, readMetric = () => null) {
  const out = [];
  for (const w of config.workflows ?? []) {
    const checks = [];
    for (const c of w.checks ?? []) {
      if (c.metric) {
        const m = readMetric(c.metric);
        const v = m?.value;
        if (v === null || v === undefined) { checks.push({ label: c.label, ok: false, detail: m?.note ? `not measured: ${m.note}` : `${c.metric} not measured` }); continue; }
        const ok = (c.atLeast === undefined || v >= c.atLeast) && (c.below === undefined || v < c.below);
        const want = [c.atLeast !== undefined && `at least ${c.atLeast}`, c.below !== undefined && `below ${c.below}`].filter(Boolean).join(' and ');
        checks.push({ label: c.label, ok, detail: want ? `${v}, need ${want}` : `${v}` });
        continue;
      }
      const body = await fetchText(new URL(c.path, config.site).toString());
      if (body === null) { checks.push({ label: c.label, ok: false, detail: `${c.path} did not load` }); continue; }
      if (c.count) {
        const found = (body.match(new RegExp(c.count, 'g')) ?? []).length;
        checks.push({ label: c.label, ok: found >= (c.atLeast ?? 1), detail: `${found} found, need ${c.atLeast ?? 1}` });
      } else {
        const missing = (c.contains ?? []).filter((t) => !body.includes(t));
        checks.push({ label: c.label, ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : 'live' });
      }
    }
    if (checks.length) out.push({ title: w.title, checks });
  }
  return { version: 1, observedAt: new Date().toISOString(), workflows: out };
}

async function fetchText(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'HQ workflow check' } });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const file = process.argv[2] ?? die('usage: workflow-checks-template.mjs <checks.json>');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    process.stdout.write(JSON.stringify(await runChecks(config, fetchText, metricReader(config.analytics ?? path.join(path.dirname(file), 'analytics-snapshot.json')))) + '\n');
  } catch (e) {
    console.error('workflow checks failed:', String(e?.message ?? e).slice(0, 120));
    process.exitCode = 1;
  }
}
function die(m) { throw Error(m); }

/** Reads a number HQ measured from the business's analytics snapshot; null if the file or the number is missing. */
export function metricReader(file) {
  let snap = null;
  try { snap = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no snapshot yet */ }
  return (id) => snap?.metrics?.find((m) => m.id === id) ?? null;
}

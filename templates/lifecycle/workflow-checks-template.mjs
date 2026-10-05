#!/usr/bin/env node
// HQ's template workflow-checks adapter: proof for workflows that send nothing (pages, measurement).
// It reads a checks file and answers pass or fail per check from public pages only: no credentials,
// no customer data. Copy it to $HQ_DATA/businesses/<slug>/workflow-checks.mjs and point
// workflow-checks-connection.json at it, with the checks file as the argument:
//   {"readOnly":true,"command":["/path/to/node","/path/to/workflow-checks.mjs","/path/to/checks.json"]}
//
// checks.json:
//   {"site":"https://example.com","workflows":[{"title":"<workflow title from HQ>","checks":[
//     {"label":"Pricing page answers the common questions","path":"/pricing/","contains":["Frequently asked"]},
//     {"label":"Sitemap lists the guides","path":"/sitemap.xml","count":"/guides/[a-z0-9-]+/","atLeast":10}]}]}
//
// stdout: {"version":1,"observedAt":ISO,"workflows":[{"title":…,"checks":[{"label":…,"ok":bool,"detail":…}]}]}
// HQ marks a workflow live only when every one of its checks passed in the last 8 days.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runChecks(config, fetchText) {
  const out = [];
  for (const w of config.workflows ?? []) {
    const checks = [];
    for (const c of w.checks ?? []) {
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
    const config = JSON.parse(fs.readFileSync(process.argv[2] ?? die('usage: workflow-checks-template.mjs <checks.json>'), 'utf8'));
    process.stdout.write(JSON.stringify(await runChecks(config, fetchText)) + '\n');
  } catch (e) {
    console.error('workflow checks failed:', String(e?.message ?? e).slice(0, 120));
    process.exitCode = 1;
  }
}
function die(m) { throw Error(m); }

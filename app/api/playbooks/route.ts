// The Playbooks tab's actions: start a queued run (the headless writer runs detached, through the CLI, and writes
// plan.md and drafts only), queue a playbook by hand, apply a ready run (opens its experiment), drop one, and set the
// business's playbook mode. Nothing here sends, posts or publishes. Local same-origin requests only; the business
// comes from the switcher cookie, never from the body.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { BUSINESS_COOKIE } from "@/lib/current";
import { localLifecycleOrigin } from "@/lib/lifecycle";
import { playbookBySlug } from "@/lib/playbooks";
import { applyRun, dropRun, getRun, mirrorRuns, playbooksDir, queueRun, writeConfig, type Mode } from "@/lib/playbook-store";
import { hqData, hqRoot, resolveCurrent } from "@/lib/store";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** The headless run outlives this request: a detached `hq playbook run`, logged to $HQ_DATA/logs. */
function startRun(slug: string, id: string) {
  const logs = path.join(hqData(), "logs");
  fs.mkdirSync(logs, { recursive: true });
  const out = fs.openSync(path.join(logs, "playbook-runs.log"), "a");
  const child = spawn(process.execPath, [path.join(hqRoot(), "node_modules", "tsx", "dist", "cli.mjs"), path.join(hqRoot(), "scripts", "hq.ts"), "playbook", "run", slug, id],
    { cwd: hqRoot(), detached: true, stdio: ["ignore", out, out], env: { ...process.env } });
  child.unref();
}

export async function POST(req: NextRequest) {
  if (!localLifecycleOrigin(req.headers.get("origin"), req.headers.get("host"))) return reply({ error: "Local same-origin request required" }, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if (!p) return reply({ error: "Choose a business" }, 400);
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? ""), note = typeof body?.note === "string" ? body.note : undefined;
  try {
    switch (body?.action) {
      case "run": {
        const r = getRun(p.slug, id);
        if (r.status !== "queued" && r.status !== "failed") return reply({ error: `This run is ${r.status}` }, 400);
        fs.mkdirSync(playbooksDir(p.slug), { recursive: true });
        startRun(p.slug, r.id);
        return reply({ id: r.id, status: "starting" });
      }
      case "queue": {
        const b = playbookBySlug(String(body?.playbook ?? ""));
        if (!b) return reply({ error: "No such playbook" }, 400);
        const r = queueRun(p.slug, b, { kind: "owner" });
        if (!r) return reply({ error: "It already has a run today" }, 400);
        mirrorRuns(p.slug);
        return reply({ id: r.id, status: r.status });
      }
      case "apply": { const r = applyRun(p.slug, id, { note }); mirrorRuns(p.slug); return reply({ id: r.id, status: r.status, experiment: r.experiment ?? null }); }
      case "drop": { const r = dropRun(p.slug, id, note); mirrorRuns(p.slug); return reply({ id: r.id, status: r.status }); }
      case "mode": {
        const mode = String(body?.mode) as Mode;
        if (!["off", "ask", "auto"].includes(mode)) return reply({ error: "Invalid mode" }, 400);
        return reply(writeConfig(p.slug, { mode }));
      }
      default: return reply({ error: "Invalid action" }, 400);
    }
  } catch (e) { return reply({ error: e instanceof Error ? e.message : "Could not update" }, 400); }
}

// Notes from the CEO tab, on the owner's decisions (kind "decision", the default) or on an attention or critical
// finding (kind "finding", lib/finding-notes.ts): add one, edit or delete one of the owner's own. Claude reads and
// answers them from the CLI (`hq decision show|note`, `hq finding show|note`). Local same-origin requests only; the
// business comes from the switcher cookie, never from the body.
import { NextRequest, NextResponse } from "next/server";

import { BUSINESS_COOKIE } from "@/lib/current";
import { localLifecycleOrigin } from "@/lib/lifecycle";
import { addFindingNote, changeFindingNote } from "@/lib/finding-notes";
import { addDecisionNote, changeDecisionNote } from "@/lib/owner-decisions";
import { resolveCurrent } from "@/lib/store";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (!localLifecycleOrigin(req.headers.get("origin"), req.headers.get("host"))) return reply({ error: "Local same-origin request required" }, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if (!p) return reply({ error: "Choose a business" }, 400);
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? ""), text = typeof body?.text === "string" ? body.text : "";
  try {
    if (body?.kind === "finding") {
      const title = typeof body?.title === "string" ? body.title : undefined;
      switch (body?.action) {
        case "note": return reply(addFindingNote(p.slug, id, text, "owner", title));
        case "edit": changeFindingNote(p.slug, id, Number(body?.n), "owner", text); return reply({ ok: true });
        case "delete": changeFindingNote(p.slug, id, Number(body?.n), "owner", null); return reply({ ok: true });
        default: return reply({ error: "Invalid action" }, 400);
      }
    }
    switch (body?.action) {
      case "note": return reply(addDecisionNote(p.slug, id, text, "owner"));
      case "edit": changeDecisionNote(p.slug, id, Number(body?.n), "owner", text); return reply({ ok: true });
      case "delete": changeDecisionNote(p.slug, id, Number(body?.n), "owner", null); return reply({ ok: true });
      default: return reply({ error: "Invalid action" }, 400);
    }
  } catch (e) { return reply({ error: e instanceof Error ? e.message : "Could not save the note" }, 400); }
}

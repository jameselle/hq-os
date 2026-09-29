// Mark a CEO finding done (or not) for one business. Local-only site, but
// still validated: the business must exist and the id must be a finding id.
import { NextResponse, type NextRequest } from "next/server";

import { setDone } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { business?: string; id?: string; done?: boolean };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    setDone(body.business ?? null, body.id, body.done !== false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

// The top-bar switcher: remember which business this browser is looking at.
import { NextResponse, type NextRequest } from "next/server";

import { BUSINESS_COOKIE } from "@/lib/current";
import { getProfile } from "@/lib/store";

export async function POST(req: NextRequest) {
  const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
  if (!slug || !getProfile(slug)) return NextResponse.json({ error: "no such business" }, { status: 404 });
  const res = NextResponse.json({ ok: true, slug });
  res.cookies.set(BUSINESS_COOKIE, slug, { path: "/", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
  return res;
}

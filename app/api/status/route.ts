// Read-only JSON of everything HQ knows: departments, live tool and skill
// state, the business, and the CEO's findings. The hq skills read this.
// ?business=<slug> picks a business; otherwise the switcher's choice or the default.
import { NextResponse, type NextRequest } from "next/server";

import { BUSINESS_COOKIE } from "@/lib/current";
import { getStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("business") ?? req.cookies.get(BUSINESS_COOKIE)?.value ?? null;
  return NextResponse.json(await getStatus(slug));
}

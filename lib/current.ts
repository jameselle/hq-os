// Which business the viewer picked, from the switcher's cookie. Server-only.
import "server-only";

import { cookies } from "next/headers";

export const BUSINESS_COOKIE = "hq.business";

export function preferredBusiness(): string | null {
  return cookies().get(BUSINESS_COOKIE)?.value ?? null;
}

// The lifecycle centre is part of Email & Lifecycle now (/email); old links, including ?preview=, land there.
import { redirect } from "next/navigation";

import { legacyLifecycleUrl } from "@/lib/email-navigation";

export default async function LifecyclePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  redirect(legacyLifecycleUrl(preview));
}

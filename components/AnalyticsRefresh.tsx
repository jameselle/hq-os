"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Re-measures HQ's own numbers and re-runs the business's analytics adapter, then reloads the page data. */
export function AnalyticsRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[11px] text-bb-danger">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
            const body = await r.json().catch(() => null);
            if (!r.ok) setError(body?.error ?? "Refresh failed");
            else if (body?.adapterError) setError("The adapter failed; HQ's own numbers were refreshed");
            router.refresh();
          })
        }
        className="rounded-lg border border-bb-border px-3 py-1.5 text-[12px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface disabled:opacity-40"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    </span>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Asks the server to re-run the business's scorecard adapter, then reloads the page data. */
export function RefreshScorecard() {
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
            const r = await fetch("/api/scorecard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
            if (!r.ok) setError((await r.json().catch(() => null))?.error ?? "Refresh failed");
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

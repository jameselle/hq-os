"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { StatusReport } from "@/lib/types";

// Slim top bar: business switcher, status pills and a
// live clock. Pills poll /api/status every 30s so a critical finding shows on
// every tab.
type Badge = { label: string; tone: "ok" | "warn" | "danger" | "neutral" };

const TONE_CLASSES: Record<Badge["tone"], string> = {
  ok: "border-bb-accent/30 bg-bb-accent/5 text-bb-fg/80",
  warn: "border-bb-warn/40 bg-bb-warn/10 text-bb-warn",
  danger: "border-bb-danger/40 bg-bb-danger/10 text-bb-danger",
  neutral: "border-bb-border bg-bb-surface text-bb-muted",
};

function badges(report: StatusReport | null, failed: boolean): Badge[] {
  if (failed) return [{ label: "STATUS UNKNOWN", tone: "neutral" }];
  if (!report) return [{ label: "CHECKING…", tone: "neutral" }];
  const critical = report.findings.filter((f) => f.severity === "critical").length;
  const decisions = report.findings.filter((f) => f.severity === "decision").length;
  const out: Badge[] = [];
  if (critical > 0) out.push({ label: `${critical} CRITICAL`, tone: "danger" });
  if (decisions > 0) out.push({ label: `${decisions} FOR YOU TO DECIDE`, tone: "warn" });
  out.push({
    label: `${report.totals.toolsRunning} RUNNING · ${report.totals.skillsReady} SKILLS`,
    tone: report.totals.toolsRunning > 0 ? "ok" : "neutral",
  });
  return out;
}

function BadgePill({ badge }: { badge: Badge }) {
  return (
    <span className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${TONE_CLASSES[badge.tone]}`}>
      {badge.tone === "ok" ? <span className="h-1.5 w-1.5 rounded-full bg-bb-accent animate-pulse" /> : null}
      {badge.label}
    </span>
  );
}

function BusinessSwitcher({ report, onSwitched }: { report: StatusReport | null; onSwitched: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!report) return null;
  if (report.businesses.length === 0) {
    return (
      <span className="rounded-full border border-bb-border bg-bb-surface px-3 py-1 text-[11px] font-mono text-bb-dim">
        NO BUSINESS YET
      </span>
    );
  }
  return (
    <label className="flex items-center gap-2 rounded-full border border-bb-blue/30 bg-bb-blue/5 pl-3 pr-1 py-0.5 text-[11px]">
      <span className="font-mono uppercase tracking-[0.12em] text-bb-dim">Business</span>
      <select
        aria-label="Business"
        disabled={busy}
        value={report.business?.slug ?? ""}
        onChange={async (e) => {
          setBusy(true);
          await fetch("/api/business", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: e.target.value }),
          });
          setBusy(false);
          onSwitched();
          router.refresh();
        }}
        className="bg-transparent text-bb-fg font-medium rounded-full px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-bb-blue/40 [&>option]:bg-bb-surface"
      >
        {report.businesses.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
            {b.demo ? " (demo)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TopBar() {
  const [now, setNow] = useState("");
  const [report, setReport] = useState<StatusReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setReport((await res.json()) as StatusReport);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="flex items-center gap-2.5 px-6 h-12 border-b border-bb-border/70">
      <BusinessSwitcher report={report} onSwitched={load} />
      <div className="flex-1" />
      {badges(report, failed).map((b) => (
        <BadgePill key={b.label} badge={b} />
      ))}
      <span className="rounded-full border border-bb-border bg-bb-surface px-3 py-1 text-[11px] font-mono tabular-nums text-bb-muted">
        {now || "--:--:--"}
      </span>
    </div>
  );
}

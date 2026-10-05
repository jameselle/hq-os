// Small hand-drawn SVG charts for HQ: a weekly line, daily bars with overlaid lines, paired
// emailed-vs-holdout bars and a horizontal funnel. No chart library. The SVGs stretch to their box
// (preserveAspectRatio="none", strokes that don't scale), and every text label is HTML beside them,
// so the charts stay legible from phone to desktop. Each chart carries an accessible <title>.

import type { ReactNode } from "react";

const STROKE = { vectorEffect: "non-scaling-stroke" } as const;

/** Format a day "2026-10-04" as "4 Oct". */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? ""}`.trim();
}

/** A weekly line, oldest to newest. Missing weeks leave a gap. */
export function Line({ points, title, format, color = "#2DD4BF", height = 128 }: {
  points: { label: string; value: number | null }[]; title: string; format: (v: number) => string; color?: string; height?: number;
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length < 2) return <p className="text-[12px] text-bb-muted">Not enough weeks to draw a trend yet.</p>;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.15, hi = max + span * 0.15;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const segments: string[][] = [[]];
  points.forEach((p, i) => {
    if (p.value === null) { if (segments.at(-1)!.length) segments.push([]); return; }
    segments.at(-1)!.push(`${x(i).toFixed(2)},${y(p.value).toFixed(2)}`);
  });
  const lastIdx = points.map((p) => p.value !== null).lastIndexOf(true);
  const last = points[lastIdx];
  return (
    <figure className="space-y-1">
      <div className="flex gap-2">
        <div className="relative w-14 shrink-0 text-right font-mono text-[10px] text-bb-dim tabular-nums" style={{ height }}>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${y(max)}%` }}>{format(max)}</span>
          {max !== min && <span className="absolute right-0 -translate-y-1/2" style={{ top: `${y(min)}%` }}>{format(min)}</span>}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg role="img" aria-label={title} viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <title>{title}</title>
            {[0, 50, 100].map((g) => <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="#1f2940" strokeWidth="1" style={STROKE} />)}
            {segments.filter((s) => s.length > 1).map((s, i) => (
              <polyline key={i} points={s.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" style={STROKE} />
            ))}
          </svg>
          {last?.value != null && (
            <span aria-hidden className="absolute h-2 w-2 -translate-x-1 -translate-y-1 rounded-full ring-2 ring-bb-bg" style={{ left: `${x(lastIdx)}%`, top: `${y(last.value)}%`, background: color }} />
          )}
        </div>
      </div>
      <figcaption className="flex justify-between pl-16 font-mono text-[10px] text-bb-dim">
        <span>{points[0].label}</span><span>{points.at(-1)!.label}</span>
      </figcaption>
    </figure>
  );
}

const ENTERED = "#5AB0F0", SENT = "#2DD4BF", SKIPPED = "#F59E0B";

/** Who entered a flow each day (bars), with sent and skipped drawn over them as lines. */
export function DailyBars({ days, title, height = 140 }: { days: { day: string; entered: number; sent: number; skipped: number }[]; title: string; height?: number }) {
  if (!days.length) return <p className="text-[12px] text-bb-muted">No days reported yet.</p>;
  const n = days.length, max = Math.max(1, ...days.flatMap((d) => [d.entered, d.sent, d.skipped]));
  const y = (v: number) => 100 - (v / max) * 96;
  const line = (k: "sent" | "skipped") => days.map((d, i) => `${(i + 0.5).toFixed(2)},${y(d[k]).toFixed(2)}`).join(" ");
  const mid = days[Math.floor((n - 1) / 2)];
  return (
    <figure className="space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-bb-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ENTERED, opacity: 0.45 }} />Entered</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5" style={{ background: SENT }} />Sent</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 border-t-2 border-dashed" style={{ borderColor: SKIPPED }} />Skipped</span>
      </div>
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col justify-between text-right font-mono text-[10px] text-bb-dim tabular-nums" style={{ height }}>
          <span>{max}</span><span>0</span>
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg role="img" aria-label={title} viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <title>{title}</title>
            <line x1="0" x2={n} y1="100" y2="100" stroke="#1f2940" strokeWidth="1" style={STROKE} />
            {days.map((d, i) => (
              <rect key={d.day} x={i + 0.12} width="0.76" y={y(d.entered)} height={100 - y(d.entered)} fill={ENTERED} opacity="0.45">
                <title>{`${d.day}: ${d.entered} entered, ${d.sent} sent, ${d.skipped} skipped`}</title>
              </rect>
            ))}
            <polyline points={line("skipped")} fill="none" stroke={SKIPPED} strokeWidth="1.5" strokeDasharray="4 3" style={STROKE} />
            <polyline points={line("sent")} fill="none" stroke={SENT} strokeWidth="2" strokeLinejoin="round" style={STROKE} />
          </svg>
        </div>
      </div>
      <figcaption className="flex justify-between pl-8 font-mono text-[10px] text-bb-dim">
        <span>{shortDay(days[0].day)}</span>{n > 2 && <span>{shortDay(mid.day)}</span>}<span>{shortDay(days.at(-1)!.day)}</span>
      </figcaption>
    </figure>
  );
}

/** One horizontal bar: a faint track with a filled share. `share` is 0..1 of the track. */
export function Bar({ share, color, title, thick = 8 }: { share: number; color: string; title: string; thick?: number }) {
  const w = Math.max(0, Math.min(1, share)) * 100;
  return (
    <svg role="img" aria-label={title} viewBox="0 0 100 10" preserveAspectRatio="none" className="block w-full" style={{ height: thick }}>
      <title>{title}</title>
      <rect x="0" y="0" width="100" height="10" rx="0" fill="#161f33" />
      {w > 0 && <rect x="0" y="0" width={Math.max(w, 0.6)} height="10" fill={color} />}
    </svg>
  );
}

type Paired = { label: string; emailed: { n: number; hit: number; rate: number | null }; holdout: { n: number; hit: number; rate: number | null } | null };
const pctText = (r: number | null) => (r === null ? "nobody yet" : `${(r * 100).toFixed(1)}%`);

/** Emailed vs holdout for each outcome: two bars per row, scaled to the largest rate shown, with each group's n. */
export function PairedBars({ rows, scale, extra, names = ["Emailed", "Holdout"] }: { rows: Paired[]; scale?: number; extra?: (row: Paired, i: number) => ReactNode; names?: [string, string] }) {
  const top = scale ?? Math.max(0.05, ...rows.flatMap((r) => [r.emailed.rate ?? 0, r.holdout?.rate ?? 0]));
  const group = (name: string, g: Paired["emailed"], color: string, label: string) => (
    <div className="space-y-0.5 text-[11.5px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-bb-muted">{name}</span>
        <span className="whitespace-nowrap font-mono tabular-nums">{pctText(g.rate)} <span className="text-bb-dim">of {g.n.toLocaleString("en-AU")}</span></span>
      </div>
      <Bar share={(g.rate ?? 0) / top} color={color} title={`${label}, ${name.toLowerCase()}: ${g.hit} of ${g.n} (${pctText(g.rate)})`} thick={10} />
    </div>
  );
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-medium">{r.label}</span>
            {extra?.(r, i)}
          </div>
          {group(names[0], r.emailed, SENT, r.label)}
          {r.holdout && group(names[1], r.holdout, "#8b94ab", r.label)}
        </div>
      ))}
    </div>
  );
}

const FUNNEL_COLOR: Record<string, string> = {
  sent: "#2DD4BF", delivered: "#2DD4BF", opened: "#5AB0F0", clicked: "#A78BFA", converted: "#22C55E",
  bounced: "#EF4444", complained: "#EF4444", unsubscribed: "#F59E0B", failed: "#EF4444",
};

/** Horizontal bars, each row as a share of the first (or of `share` when given). */
export function Funnel({ rows, title, color }: { rows: { label: string; count: number; share: number | null }[]; title: string; color?: string }) {
  if (!rows.length) return <p className="text-[12px] text-bb-muted">Nothing reported.</p>;
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul aria-label={title} className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="first-letter:uppercase">{r.label.replaceAll("_", " ")}</span>
            <span className="font-mono tabular-nums">{r.count.toLocaleString("en-AU")}{r.share !== null && <span className="text-bb-dim"> · {pctText(r.share)}</span>}</span>
          </div>
          <Bar share={r.count / top} color={color ?? FUNNEL_COLOR[r.label.trim().toLowerCase()] ?? "#5AB0F0"} title={`${title}: ${r.label} ${r.count}`} />
        </li>
      ))}
    </ul>
  );
}

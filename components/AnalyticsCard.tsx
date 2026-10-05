// One analytics number as a card: its question, current value, change from last week, the chart its catalogue entry
// asks for (weekly line, weekly bars or a split) and its note. Shared by the analytics board (Data & Analytics tab) and each workflow's page.
import Link from "next/link";

import { Line, SplitBars, WeekBars } from "@/components/charts";
import type { BoardMetric } from "@/lib/analytics";
import { formatAnalytics } from "@/lib/analytics-metrics";
import { PILL } from "@/lib/tone";
import { workflowSlug, type Lever } from "@/lib/workflows";

export const COLOR: Record<Lever, string> = { get: "#2DD4BF", keep: "#5AB0F0", expand: "#A78BFA", base: "#8b94ab" };

const shortWeek = (w: string) => w.replace(/^\d{4}-/, "");

export function Change({ x, currency }: { x: BoardMetric; currency: string }) {
  if (x.change === null || x.change === 0) return x.change === 0 ? <span className="font-mono text-[10.5px] text-bb-dim">no change</span> : null;
  const good = (x.change > 0) === (x.def.better === "up");
  const abs = Math.abs(x.change);
  const text = x.def.unit === "rate" ? `${(abs * 100).toFixed(1)} pts` : formatAnalytics(x.def.unit, abs, currency);
  return <span className={`font-mono text-[10.5px] ${good ? "text-bb-accent" : "text-bb-danger"}`}>{x.change > 0 ? "▲" : "▼"} {text} <span className="text-bb-dim">vs last week</span></span>;
}

function Chart({ x, currency }: { x: BoardMetric; currency: string }) {
  const format = (v: number) => formatAnalytics(x.def.unit, v, currency);
  const color = COLOR[x.def.lever];
  const points = x.points.map((p) => ({ label: shortWeek(p.week), value: p.value }));
  const enough = points.filter((p) => p.value !== null).length >= 2;
  const split = x.breakdown.length > 0 && <SplitBars rows={x.breakdown} title={`${x.def.label}${x.period ? `, ${x.period}` : ""}`} format={format} color={color} parts={!x.def.average && (x.def.unit === "count" || x.def.unit === "money" || x.def.unit === "minutes")} />;
  if (x.def.chart === "split") return split || (enough ? <Line points={points} title={`${x.def.label} by week`} format={format} color={color} height={96} /> : <Building />);
  const allZero = enough && points.every((p) => p.value === null || p.value === 0);
  const trend = !enough ? null : allZero ? <p className="text-[11.5px] text-bb-muted">0 in every week shown.</p> : x.def.chart === "bars"
    ? <WeekBars points={points} title={`${x.def.label} by week`} format={format} color={color} height={96} />
    : <Line points={points} title={`${x.def.label} by week`} format={format} color={color} height={96} />;
  if (!trend && !split) return <Building />;
  return (
    <div className="space-y-3">
      {trend}
      {split && <div className="space-y-1.5 border-t border-bb-border/60 pt-2.5">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Split{x.period ? ` · ${x.period}` : ""}</div>
        {split}
      </div>}
    </div>
  );
}

const Building = () => <p className="text-[11.5px] text-bb-dim">One reading so far. The trend draws itself as the daily refresh keeps a value per week.</p>;

export function Card({ x, currency, workflows = true }: { x: BoardMetric; currency: string; workflows?: boolean }) {
  return (
    <article className="card flex min-w-0 flex-col gap-2.5 p-4">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[13px] font-semibold leading-snug">{x.def.label}</h3>
          {x.quality === "approx" && <span className={`${PILL} border-bb-warn/40 bg-bb-warn/10 text-bb-warn shrink-0`}>approx</span>}
        </div>
        <p className="text-[11.5px] text-bb-muted">{x.def.question}</p>
      </header>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[24px] font-semibold tabular-nums leading-none">{formatAnalytics(x.def.unit, x.value, currency)}</span>
        <Change x={x} currency={currency} />
      </div>
      <Chart x={x} currency={currency} />
      <footer className="mt-auto space-y-1 border-t border-bb-border/60 pt-2">
        {x.note && <p className="text-[11px] text-bb-muted">{x.note}</p>}
        {workflows && <p className="text-[10.5px] text-bb-dim">
          Moves with {x.workflows.map((t, i) => <span key={t}>{i > 0 && ", "}<Link href={`/workflows/${workflowSlug(t)}`} className="hover:text-bb-fg">{t}</Link></span>)}
        </p>}
      </footer>
    </article>
  );
}


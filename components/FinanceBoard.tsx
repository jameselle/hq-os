// Money in and out on the Finance tab: income, refunds and costs per month from the business's ledger (hand-written
// entries plus the daily totals the finance sync writes from billing), with an honest note when costs are missing.
import fs from "node:fs";
import path from "node:path";

import { WeekBars } from "@/components/charts";
import { SplitBars } from "@/components/charts";
import { importedCosts, sourceLabel } from "@/lib/finance-costs";
import { financeConnected, moneyByMonth, SYNCED } from "@/lib/finance-sync";
import { loadLedger } from "@/lib/ledger-spend";
import type { Profile } from "@/lib/profile";
import { formatValue } from "@/lib/scorecard-metrics";
import { ledgerPath } from "@/lib/store";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (m: string) => `${MONTH[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export function FinanceBoard({ business }: { business: Profile }) {
  const ledger = ledgerPath(business.slug);
  const months = (() => { try { return moneyByMonth(loadLedger(ledger), business.currency); } catch { return []; } })().slice(-12);
  const synced = path.join(path.dirname(ledger), SYNCED);
  const syncedAt = fs.existsSync(synced) ? fs.statSync(synced).mtime : null;
  const notes = syncedAt ? fs.readFileSync(synced, "utf8").split("\n").filter((l) => l.startsWith("; Note: ")).map((l) => l.slice(8)) : [];
  const imported = (() => { try { return importedCosts(business.slug, business.currency).filter((c) => c.to); } catch { return []; } })();
  const f = (n: number) => formatValue("money", n, business.currency);
  const net = (m: (typeof months)[number]) => m.income - m.refunds;
  const last = months.at(-1), prev = months.at(-2);
  const costs3 = months.slice(-3).reduce((n, m) => n + m.costs, 0);
  const byCost: Record<string, number> = {};
  for (const m of months.slice(-3)) for (const [k, v] of Object.entries(m.byCost)) byCost[k] = (byCost[k] ?? 0) + v;
  return (
    <section id="money" aria-labelledby="money-h" className="space-y-4 min-w-0 scroll-mt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow mb-1">Finance · {business.name}</div>
          <h2 id="money-h" className="text-xl font-semibold">Money in and out</h2>
          <p className="text-[12.5px] text-bb-muted max-w-[80ch]">
            From the ledger ({business.currency}): your own entries plus {financeConnected(business.slug) ? `daily totals synced from billing${syncedAt ? `, last ${syncedAt.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: business.timezone })}` : ""}` : "nothing synced (no finance connection)"}{imported.map((c) => `, plus monthly costs imported from ${sourceLabel(c.source)} (${label(c.from!)} to ${label(c.to!)})`).join("")}. View every entry in Fava, <a href="http://localhost:5055" className="text-bb-blue hover:underline">localhost:5055</a>.
          </p>
        </div>
      </div>
      {!months.length ? <p className="card px-4 py-3 text-[12.5px] text-bb-muted">The ledger has no income or costs yet. {financeConnected(business.slug) ? `Run npm run hq -- finance sync ${business.slug}.` : "Connect billing with a finance adapter (docs/guides/finance-sync.md), or add entries to the ledger."}</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ["Income this month", last ? f(net(last)) : "—", last ? `${label(last.month)} so far` : ""],
              ["Last month", prev ? f(net(prev)) : "—", prev ? label(prev.month) : ""],
              ["Costs, last 3 months", f(costs3), costs3 ? "recorded in the ledger" : "none recorded yet"],
              ["Margin, last month", prev ? f(net(prev) - prev.costs) : "—", costs3 ? "income less recorded costs" : "costs missing, so this is too high"],
            ].map(([k, v, h]) => (
              <div key={k} className="card p-3">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">{k}</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-bb-dim">{h}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card space-y-2 p-4"><h3 className="text-[13px] font-semibold">Income by month, after refunds</h3>
              <WeekBars points={months.map((m) => ({ label: label(m.month), value: net(m) }))} title="Income by month" format={f} color="#22C55E" /></div>
            <div className="card space-y-2 p-4"><h3 className="text-[13px] font-semibold">Costs, last 3 months</h3>
              {costs3 ? <SplitBars rows={Object.entries(byCost).map(([label, value]) => ({ label, value }))} title="Costs by account" format={f} color="#F59E0B" />
                : <p className="text-[12.5px] text-bb-warn">No costs are in the ledger, so margin, cost to win and payback all read better than they are. Import them from your accounting system (Finance guide, &ldquo;Connect your accounting system&rdquo;), or add hosting, software, ads and contractors to <code className="font-mono text-[11.5px]">ledger.beancount</code> (or ask the Finance department: <code className="font-mono text-[11.5px]">/hq:dept finance</code>).</p>}
            </div>
          </div>
          {notes.length > 0 && <ul className="space-y-0.5 text-[11.5px] text-bb-dim">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </>
      )}
    </section>
  );
}

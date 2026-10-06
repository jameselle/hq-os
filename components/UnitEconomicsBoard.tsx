// Unit economics on the Finance tab: the last closed month against the 3 months before it, break-even customers,
// lifetime value to cost to win, the biggest cost lines with their change, and what can't be measured yet.
// Numbers from lib/unit-economics.ts (ledger plus scorecard); nothing here is zero-filled.
import type { Profile } from "@/lib/profile";
import { formatValue } from "@/lib/scorecard-metrics";
import { FIELD_LABEL, SHOWN, burnText, changeLabel, formatField, jumpText, monthName, priorCell, priorLabel } from "@/lib/unit-economics";
import { loadUnitEconomics, unitBriefs } from "@/lib/unit-economics-store";

const th = "text-left pb-2 pr-5 last:pr-0 text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim font-normal";
const td = "py-1.5 pr-5 last:pr-0 border-t border-bb-border/60 text-[12.5px] align-top tabular-nums";

export function UnitEconomicsBoard({ business }: { business: Profile }) {
  const u = (() => { try { return loadUnitEconomics(business.slug); } catch { return null; } })();
  const L = u?.latest ?? null, P = u?.prior ?? null;
  const cur = business.currency;
  const money = (n: number) => formatValue("money", n, cur);
  const brief = (() => { try { return unitBriefs(business.slug)[0] ?? null; } catch { return null; } })();
  const findings = u && L ? [...u.jumps.map((j) => jumpText(j, cur)), ...(u.burnStreak ? [burnText(u.burnStreak, cur)] : [])] : [];
  const v = L?.values;
  const tiles: [string, string, string][] = v ? [
    ["Revenue", formatField("revenue", v.revenue, cur), P ? `${priorLabel(P.months)} avg ${priorCell(P, "revenue", cur)}` : ""],
    ["Costs", formatField("costs", v.costs, cur), P ? `${priorLabel(P.months)} avg ${priorCell(P, "costs", cur)}` : ""],
    ["Burn", formatField("burn", v.burn, cur), v.burn === 0 ? "revenue covered costs" : "costs less revenue"],
    ["Break-even customers", v.breakEven === null ? "not measured" : String(v.breakEven), v.breakEven === null ? L!.missing.breakEven ?? "" : v.paying !== null ? `${v.paying} paying now` : "at today's revenue per customer"],
    ["Lifetime value to cost to win", formatField("ltvToCac", v.ltvToCac, cur), v.ltvToCac === null ? L!.missing.ltvToCac ?? "" : "aim for at least 3x"],
    ["Payback", formatField("payback", v.payback, cur), v.payback === null ? L!.missing.payback ?? "" : "months of revenue to win back cost to win"],
  ] : [];
  return (
    <section id="unit-economics" aria-labelledby="unit-h" className="space-y-4 min-w-0 scroll-mt-4">
      <div>
        <div className="eyebrow mb-1">Finance · Unit economics check</div>
        <h2 id="unit-h" className="text-xl font-semibold">Unit economics</h2>
        <p className="text-[12.5px] text-bb-muted max-w-[80ch]">
          {L ? `${monthName(L.month)}, the last closed month${P ? `, against the average of ${priorLabel(P.months)}` : ""}. ` : ""}
          Revenue and costs come from the ledger ({cur}, every cost recorded there); paying customers, MRR, churn and new paying customers from the growth scorecard.
          {" "}Brief: <code className="font-mono text-[11.5px]">npm run hq -- finance unit-economics {business.slug} --save</code>{brief ? `, last saved ${brief.at.slice(0, 10)}` : ", none saved yet"}.
        </p>
      </div>
      {!L ? (
        <p className="card px-4 py-3 text-[12.5px] text-bb-muted">No closed month has costs in the ledger yet, so there is nothing to work out. Import them from the accounting system (Finance guide, &ldquo;Connect your accounting system&rdquo;) or add them to <code className="font-mono text-[11.5px]">ledger.beancount</code>.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map(([k, val, h]) => (
              <div key={k} className="card p-3 min-w-0">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">{k}</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums">{val}</div>
                <div className="text-[11px] text-bb-dim">{h}</div>
              </div>
            ))}
          </div>
          {findings.length > 0 && (
            <div className="card p-4 space-y-2 border-bb-warn/40">
              {findings.map((f) => (
                <div key={f.title}>
                  <p className="text-[12.5px] font-semibold text-bb-warn">{f.title}</p>
                  <p className="text-[12px] text-bb-muted">{f.detail}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card p-4 min-w-0">
              <h3 className="text-[13px] font-semibold">This month against the months before</h3>
              <div className="mt-2 overflow-x-auto"><table className="w-full border-collapse">
                <thead><tr><th className={th}>Number</th><th className={th}>{monthName(L.month)}</th>{P && <th className={th}>Average, {priorLabel(P.months)}</th>}</tr></thead>
                <tbody>
                  {SHOWN.map((f) => (
                    <tr key={f}>
                      <td className={td}>{FIELD_LABEL[f]}</td>
                      <td className={`${td} ${L.values[f] === null ? "text-bb-dim" : ""}`} title={L.missing[f]}>{formatField(f, L.values[f], cur)}</td>
                      {P && <td className={`${td} ${P.values[f] === null ? "text-bb-dim" : "text-bb-muted"}`}>{priorCell(P, f, cur)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
            <div className="space-y-3 min-w-0">
              <div className="card p-4 min-w-0">
                <h3 className="text-[13px] font-semibold">Biggest cost lines, {monthName(L.month)}</h3>
                <div className="mt-2 overflow-x-auto"><table className="w-full border-collapse">
                  <thead><tr><th className={th}>Line</th><th className={th}>Amount</th><th className={th}>Month before</th><th className={th}>Change</th></tr></thead>
                  <tbody>
                    {u!.topLines.map((l) => (
                      <tr key={l.account}>
                        <td className={td} title={l.account}>{l.label}</td>
                        <td className={td}>{money(l.amount)}</td>
                        <td className={`${td} text-bb-muted`}>{l.previous === null ? "not recorded" : money(l.previous)}</td>
                        <td className={`${td} ${l.change !== null && l.change > 0 ? "text-bb-warn" : "text-bb-muted"}`}>
                          {changeLabel(l, cur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
              {u!.gaps.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-[13px] font-semibold">Not measurable yet</h3>
                  <ul className="mt-1 space-y-0.5 text-[12px] text-bb-muted">{u!.gaps.map((g) => <li key={g.field}>{FIELD_LABEL[g.field]}: {g.why}.</li>)}</ul>
                </div>
              )}
              {L.basis.length > 0 && <ul className="space-y-0.5 text-[11.5px] text-bb-dim">{[...new Set(L.basis)].map((b) => <li key={b}>{b}.</li>)}</ul>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

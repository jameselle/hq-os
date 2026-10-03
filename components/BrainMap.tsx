"use client";

// The brain on the Workflows tab: the shared HQ brain and this business's vault side by side, each
// with its five note types and live counts, and the departments around them. Pick a department to
// see what it reads (blue) and writes (green); lessons, playbooks and decisions move up to the HQ
// brain (violet) once the owner says yes. The map itself comes from lib/brain.ts.

import { useState } from "react";

import { NOTE_TYPES, PROMOTABLE, TYPE_INFO, access, type NoteType } from "@/lib/brain";
import type { BrainStats } from "@/lib/brain-store";
import { DEPARTMENTS } from "@/lib/registry";
import { PILL } from "@/lib/tone";
import { NODES, type Node } from "@/lib/workflows";

const DEPT = Object.fromEntries(DEPARTMENTS.map((d) => [d.slug, d]));
const label = (n: Node) => (n === "ceo" ? "CEO" : DEPT[n]?.label ?? n);

const W = 980, H = 530;
const CARD = { hq: { x: 16, w: 262 }, business: { x: 702, w: 262 } } as const;
const ROW0 = 132, ROWH = 74, ROWHH = 58;
const rowY = (t: NoteType) => ROW0 + NOTE_TYPES.indexOf(t) * ROWH;
const READ = "#5AB0F0", WRITE = "#22C55E", PROMOTE = "#A78BFA";

/** Departments in one column between the two brains. */
const COL = { x: 395, w: 190 };
const deptY = (n: Node) => 78 + NODES.indexOf(n) * 27.5;

function readsType(n: Node, t: NoteType) {
  const r = access(n).reads[t];
  return r === "all" || r.length > 0;
}
function writesType(n: Node, t: NoteType) {
  return access(n).writes[t] !== false;
}

export function BrainMap({ stats, businessName, demo, active }: { stats: BrainStats; businessName: string | null; demo: boolean; active: string[] }) {
  const [sel, setSel] = useState<Node>(active.includes("content") ? "content" : "ceo");
  const a = access(sel);
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
  const readTypes = NOTE_TYPES.filter((t) => readsType(sel, t));
  const writeTypes = NOTE_TYPES.filter((t) => writesType(sel, t));
  const me = stats.perDept[sel];

  return (
    <section aria-labelledby="brain-h" className="space-y-3">
      <div>
        <div className="eyebrow mb-1">The brain</div>
        <h2 id="brain-h" className="text-[15px] font-semibold">
          What every department reads and writes{demo && <span className="font-normal text-bb-muted"> · demo data</span>}
        </h2>
        <p className="text-[12.5px] text-bb-muted max-w-[75ch]">
          Two Obsidian brains. The <span className="font-semibold text-bb-fg">HQ brain</span> holds what's true for every business; the{" "}
          <span className="font-semibold text-bb-fg">{businessName ?? "business"} vault</span> holds this business's facts, customers and numbers.
          Departments read both before they work (<span className="font-mono">hq brain read</span>) and write what they learned after. A lesson moves up to the HQ brain only when the CEO proposes it and you say yes.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] items-start">
        <div className="card overflow-x-auto p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px]" role="img" aria-label={`Brain map: what ${label(sel)} reads and writes`}>
            <defs>
              {[["r", READ], ["w", WRITE], ["p", PROMOTE]].map(([id, c]) => (
                <marker key={id} id={`brain-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
                </marker>
              ))}
            </defs>

            {/* promote: business vault → HQ brain, over the top, for the types that can move up */}
            <path d={`M ${CARD.business.x + 70} 66 C ${CARD.business.x + 40} 20, ${CARD.hq.x + CARD.hq.w - 40} 20, ${CARD.hq.x + CARD.hq.w - 70} 66`} fill="none" stroke={PROMOTE} strokeWidth={1.6} strokeDasharray="5 4" markerEnd="url(#brain-p)" />
            <text x={W / 2} y={30} textAnchor="middle" fill={PROMOTE} fontSize={11}>promote: {PROMOTABLE.map((t) => TYPE_INFO[t].label.toLowerCase()).join(", ")} (CEO proposes, you say yes)</text>

            {/* reads: HQ brain → department (left), business vault → department (right) */}
            {readTypes.filter((t) => t !== "signal").map((t) => (
              <path key={`rh-${t}`} d={curve(CARD.hq.x + CARD.hq.w, rowY(t) + ROWHH / 2, COL.x, deptY(sel))} fill="none" stroke={READ} strokeWidth={1.6} opacity={0.75} markerEnd="url(#brain-r)" />
            ))}
            {readTypes.map((t) => (
              <path key={`rb-${t}`} d={curve(CARD.business.x, rowY(t) + 18, COL.x + COL.w, deptY(sel) - 3)} fill="none" stroke={READ} strokeWidth={1.6} opacity={0.85} markerEnd="url(#brain-r)" />
            ))}
            {/* writes: department → business vault */}
            {writeTypes.map((t) => (
              <path key={`w-${t}`} d={curve(COL.x + COL.w, deptY(sel) + 4, CARD.business.x, rowY(t) + 40)} fill="none" stroke={WRITE} strokeWidth={1.6} strokeDasharray="6 3" opacity={0.9} markerEnd="url(#brain-w)" />
            ))}

            {/* the two brains */}
            {(["hq", "business"] as const).map((s) => (
              <g key={s}>
                <rect x={CARD[s].x} y={70} width={CARD[s].w} height={ROW0 - 70 + NOTE_TYPES.length * ROWH - (ROWH - ROWHH) + 14} rx={14} fill="#0e1424" stroke={s === "hq" ? PROMOTE : "#2a3550"} strokeOpacity={s === "hq" ? 0.55 : 1} />
                <text x={CARD[s].x + 16} y={98} fill="#e8ecf5" fontSize={15} fontWeight={600}>{s === "hq" ? "HQ brain" : `${(businessName ?? "Business").slice(0, 24)} vault`}</text>
                <text x={CARD[s].x + 16} y={117} fill="#8b94ab" fontSize={11}>{s === "hq" ? "every business · no private facts" : "this business only"}</text>
                {NOTE_TYPES.map((t) => {
                  const on = readTypes.includes(t) && (t !== "signal" || s === "business");
                  const w = s === "business" && writeTypes.includes(t);
                  return (
                    <g key={t}>
                      <rect x={CARD[s].x + 12} y={rowY(t)} width={CARD[s].w - 24} height={ROWHH} rx={10}
                        fill={on || w ? "#141c33" : "#0b1120"} stroke={w ? WRITE : on ? READ : "#1f2940"} strokeOpacity={w || on ? 0.6 : 1} />
                      <text x={CARD[s].x + 26} y={rowY(t) + 24} fill={on || w ? "#e8ecf5" : "#8b94ab"} fontSize={14} fontWeight={600}>{TYPE_INFO[t].label}</text>
                      <text x={CARD[s].x + 26} y={rowY(t) + 42} fill="#8b94ab" fontSize={10.5}>{t === "signal" && s === "hq" ? "stay in their business" : TYPE_INFO[t].blurb.split(":")[0].split(",")[0].slice(0, 32)}</text>
                      <text x={CARD[s].x + CARD[s].w - 28} y={rowY(t) + 35} textAnchor="end" fill={stats.counts[s][t] ? "#e8ecf5" : "#59627a"} fontSize={18} fontFamily="ui-monospace, monospace">{stats.counts[s][t]}</text>
                    </g>
                  );
                })}
              </g>
            ))}

            {/* departments */}
            {NODES.map((n) => {
              const y = deptY(n);
              const isSel = n === sel;
              const off = n !== "ceo" && !active.includes(n);
              return (
                <g key={n} onClick={() => setSel(n)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(n)} tabIndex={0} role="button" aria-pressed={isSel} aria-label={label(n)} className="cursor-pointer focus:outline-none">
                  <rect x={COL.x} y={y - 11.5} width={COL.w} height={23} rx={11.5} fill={isSel ? "#16213d" : "#0e1424"} stroke={isSel ? READ : "#2a3550"} strokeWidth={isSel ? 1.6 : 1} strokeDasharray={off ? "3 3" : undefined} />
                  <text x={COL.x + COL.w / 2} y={y + 4} textAnchor="middle" fill={off ? "#59627a" : "#e8ecf5"} fontSize={11.5} fontWeight={isSel ? 700 : 500}>{label(n)}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="card space-y-3 p-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">{label(sel)}</h3>
            <span className="font-mono text-[11px] text-bb-dim">{me?.reads ?? 0} notes to read · {me?.owns ?? 0} written</span>
          </div>
          <div className="text-[12.5px]">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Reads</div>
            <ul className="mt-1 space-y-0.5">
              {readTypes.map((t) => {
                const r = a.reads[t];
                return (
                  <li key={t}><span className="font-semibold" style={{ color: READ }}>{TYPE_INFO[t].label}</span>{" "}
                    <span className="text-bb-muted">{r === "all" ? "all of them" : t === "signal" ? "sent to it, last 30 days" : r.length === 1 ? "its own" : `its own and from ${r.slice(1).map(label).join(", ")}`}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="text-[12.5px]">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Writes</div>
            <ul className="mt-1 space-y-0.5">
              {writeTypes.map((t) => {
                const w = a.writes[t];
                return (
                  <li key={t}><span className="font-semibold" style={{ color: WRITE }}>{TYPE_INFO[t].label}</span>{" "}
                    <span className="text-bb-muted">{t === "signal" ? `to ${w === "all" ? "anyone" : (w as Node[]).map(label).join(", ")}` : "its own"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="text-[12.5px]">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-bb-dim">Newest in its reading list</div>
            {me?.top.length ? (
              <ul className="mt-1 space-y-1">
                {me.top.map((x, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`${PILL} border-bb-border bg-bb-surface text-bb-muted`}>{x.scope === "hq" ? "HQ" : "biz"}</span>
                    <span><span className="text-bb-muted">{TYPE_INFO[x.type].label.replace(/s$/, "")}:</span> {x.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-bb-muted">Nothing yet. It fills as skills write what they learn.</p>
            )}
          </div>
          <p className="border-t border-dashed border-bb-border pt-2 text-[12px] text-bb-muted">
            {stats.candidates ? <><span className="font-semibold" style={{ color: PROMOTE }}>{stats.candidates} lesson{stats.candidates === 1 ? "" : "s"}</span> waiting to move up to the HQ brain: the next <span className="font-mono">/hq:ceo</span> proposes them.</> : "No lessons waiting to move up."}
            {!stats.hqExists && <> No HQ brain yet: <span className="font-mono">npm run hq -- brain init</span>.</>}
          </p>
        </aside>
      </div>
    </section>
  );
}

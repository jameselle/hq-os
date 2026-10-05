// Support on the Support & Community tab: what's waiting for a reply (answered in the business's own admin), what
// customers ask about, where new customers get stuck, and how fast they hear back. No message text reaches HQ.
import { SplitBars, WeekBars } from "@/components/charts";
import type { Profile } from "@/lib/profile";
import { supportState } from "@/lib/support";

const ago = (iso: string) => { const h = (Date.now() - Date.parse(iso)) / 3600e3; return h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`; };

export function SupportBoard({ business }: { business: Profile }) {
  const { connected, snapshot: s, stale } = (() => { try { return supportState(business.slug); } catch { return { connected: false, snapshot: null, stale: true }; } })();
  const count = (n: number) => String(n);
  return (
    <section id="support-board" aria-labelledby="support-h" className="space-y-4 min-w-0 scroll-mt-4">
      <div>
        <div className="eyebrow mb-1">Support · {business.name}</div>
        <h2 id="support-h" className="text-xl font-semibold">Customers waiting, and what they ask about</h2>
        <p className="text-[12.5px] text-bb-muted max-w-[80ch]">
          {s ? `Read ${new Date(s.observedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: business.timezone })}${stale ? " (over a day ago)" : ""} from ${s.channels?.join(" and ") ?? "the business's support"}. Themes come from the customer's first message, read inside the business's own database; no message text reaches HQ.`
            : connected ? `Connected, but not read yet: npm run hq -- support refresh ${business.slug}.` : "No support connection yet: add a read-only support adapter (docs/guides/support-desk.md)."}
        </p>
      </div>
      {s && (
        <>
          <div className="card space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold">{s.waiting.length ? `Waiting for a reply (${s.waiting.length})` : "Nobody is waiting for a reply"}</h3>
              {s.answerAt && <a href={s.answerAt} target="_blank" rel="noreferrer" className="text-[12.5px] text-bb-blue hover:underline">Answer them in the admin</a>}
            </div>
            {s.waiting.length > 0 && (
              <ul className="divide-y divide-bb-border/60">
                {s.waiting.map((w) => (
                  <li key={w.ref} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[12.5px]">
                    <span><span className="font-medium">{w.theme}</span> <span className="text-bb-muted">· {w.channel}{w.openedFrom ? `, from ${w.openedFrom}` : ""}</span></span>
                    <span className="font-mono text-[11px] text-bb-dim">{w.ref} · waiting {ago(w.lastAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="card space-y-2 p-4"><h3 className="text-[13px] font-semibold">What customers ask about, 90 days</h3>
              <SplitBars rows={Object.entries(s.themes).map(([label, value]) => ({ label, value }))} title="Support themes" format={count} color="#5AB0F0" /></div>
            <div className="card space-y-2 p-4"><h3 className="text-[13px] font-semibold">Where new customers get stuck</h3>
              <p className="text-[11.5px] text-bb-dim">Customers who wrote within 14 days of signing up. Sent to Email for the onboarding emails.</p>
              {s.stuck && Object.keys(s.stuck).length ? <SplitBars rows={Object.entries(s.stuck).map(([label, value]) => ({ label, value }))} title="New customer themes" format={count} color="#A78BFA" /> : <p className="text-[12.5px] text-bb-muted">No new customers wrote in.</p>}</div>
            <div className="card space-y-2 p-4"><h3 className="text-[13px] font-semibold">Conversations by week</h3>
              <WeekBars points={s.weekly.map((w) => ({ label: w.week.slice(5), value: w.opened }))} title="Conversations opened by week" format={count} color="#5AB0F0" height={90} />
              <p className="text-[11.5px] text-bb-muted">Last 4 weeks: {s.weekly.slice(-4).reduce((n, w) => n + w.opened, 0)} opened, {s.weekly.slice(-4).reduce((n, w) => n + w.answered, 0)} answered{(() => { const h = s.weekly.slice(-4).map((w) => w.medianReplyHours).filter((x): x is number => x !== null); return h.length ? `, first reply in ${Math.max(...h) < 1 ? "under an hour" : `about ${Math.round(Math.max(...h))} hours at worst`} (weekly median)` : ""; })()}.{s.ratings ? ` Ratings: ${s.ratings.up} up, ${s.ratings.down} down.` : ""}</p></div>
          </div>
          {s.blind?.length ? <p className="text-[11.5px] text-bb-dim">Not seen by HQ: {s.blind.join("; ")}.</p> : null}
          <p className="text-[11.5px] text-bb-dim">Each Monday the themes go to Email, Data and Product & Engineering as a signal in the brain.</p>
        </>
      )}
    </section>
  );
}

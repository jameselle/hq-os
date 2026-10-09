// The Partnerships card on the Sales & Partnerships tab: the pipeline at a glance and the way in to the board.
import Link from "next/link";

import { MeasureValue, PartnerCounts } from "@/components/PartnerParts";
import { partnersView } from "@/lib/partner-report";
import type { Profile } from "@/lib/profile";

export function PartnersSummary({ business }: { business: Profile }) {
  let v: ReturnType<typeof partnersView> | null = null;
  try { v = partnersView(business.slug); } catch { v = null; }
  const r = v?.report;
  return (
    <section className="card p-4 space-y-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Partnerships <span className="font-normal text-bb-muted">({r?.total ?? 0} partners)</span></h2>
        <Link href="/sales/partners" className="text-[12px] text-bb-blue hover:underline">Open the partner board →</Link>
      </div>
      {!r || !r.total ? (
        <p className="text-[12.5px] text-bb-muted">No partners yet. Find and screen creators, podcasts and affiliates with <span className="font-mono">/hq:partners</span>; nothing goes out without your yes.</p>
      ) : (
        <>
          <PartnerCounts counts={r.counts} />
          <div className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
            <div><div className="text-bb-dim">Live and tagged</div><div className="text-[15px] font-semibold tabular-nums">{r.liveTagged}</div></div>
            <div><div className="text-bb-dim">Partner sign-ups</div><MeasureValue m={r.totals.signups} currency={business.currency} small /></div>
            <div><div className="text-bb-dim">Drafts not sent</div><div className="text-[15px] font-semibold tabular-nums">{r.waiting}</div></div>
            <div><div className="text-bb-dim">Follow-ups ready</div><div className={`text-[15px] font-semibold tabular-nums ${r.followUps ? "text-bb-warn" : ""}`}>{r.followUps}</div></div>
            {r.failed > 0 && <div><div className="text-bb-dim">Emails failed</div><div className="text-[15px] font-semibold tabular-nums text-bb-danger">{r.failed}</div></div>}
          </div>
        </>
      )}
    </section>
  );
}

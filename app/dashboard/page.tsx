// The Dashboard: the business's day-to-day numbers and the customers to reach out to, on one page. Data comes
// from the business's private dashboard adapter and is held in memory only (lib/dashboard-store.ts).
import Link from 'next/link';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {dashboardConnected, peekDashboard} from '@/lib/dashboard-store';
import {DashboardBoard} from '@/components/DashboardBoard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const p = resolveCurrent(await preferredBusiness());
  const connected = p ? dashboardConnected(p.slug) : false;
  const held = p && connected ? peekDashboard(p.slug) : null;
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard{p && <span className="text-[17px] font-normal text-bb-muted"> · {p.name}</span>}</h1>
        <p className="mt-1 max-w-[75ch] text-[13px] text-bb-muted">
          This business&apos;s day-to-day numbers and the people worth reaching out to, read live from its own systems. Customer details are kept in
          memory only; HQ never saves them.
        </p>
      </header>
      {!p ? (
        <p className="card px-4 py-3 text-[12.5px] text-bb-muted">Choose a business to see its dashboard.</p>
      ) : !connected ? (
        <section className="card space-y-2 p-4">
          <h2 className="text-[15px] font-semibold">No dashboard connection yet</h2>
          <p className="max-w-[80ch] text-[12.5px] text-bb-muted">
            HQ can&apos;t see {p.name}&apos;s numbers yet. Connect Stripe, Instagram or your own database in about 10 minutes, or try the demo:
          </p>
          <pre className="overflow-x-auto rounded-md bg-bb-surface2 px-3 py-2 font-mono text-[12px]">npm run hq -- dashboard connect {p.slug} stripe   # or instagram, or demo</pre>
          <p className="text-[12.5px] text-bb-muted">
            Or ask Claude: &quot;connect my dashboard&quot;. <Link href="/guides/dashboard" className="text-bb-blue hover:underline">Step by step</Link>
          </p>
        </section>
      ) : (
        <DashboardBoard key={p.slug} initial={held ? {business: p.name, connected: true, ...held} : null} />
      )}
    </div>
  );
}

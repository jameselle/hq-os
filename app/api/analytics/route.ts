import {NextRequest, NextResponse} from 'next/server';
import {localHost, localLifecycleOrigin} from '@/lib/lifecycle';
import {analyticsBoard, isoWeek, lastWeeks, runAnalytics} from '@/lib/analytics';
import {countOpen, fetchCompetitorChanges} from '@/lib/analytics-findings';
import {getStatus} from '@/lib/status';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export async function GET(req: NextRequest) {
  if (!localHost(req.headers.get('host'))) return reply({error: 'Local request required'}, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  return reply(p ? analyticsBoard(p.slug) : {business: null});
}
export async function POST(req: NextRequest) {
  if (!localLifecycleOrigin(req.headers.get('origin'), req.headers.get('host'))) return reply({error: 'Local same-origin request required'}, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if (!p) return reply({error: 'Choose a business'}, 400);
  const body = await req.json().catch(() => null);
  if (body?.action !== 'refresh') return reply({error: 'Invalid action'}, 400);
  try {
    const status = await getStatus(p.slug).catch(() => null);
    const tz = p.timezone || 'UTC';
    const r = await runAnalytics(p.slug, new Date(), {
      openFindings: status?.business?.slug === p.slug ? countOpen(status.findings) : null,
      competitors: await fetchCompetitorChanges(p.slug, lastWeeks(12, Date.now(), tz), tz, isoWeek),
    });
    return reply({business: p.name, observedAt: r.snapshot?.observedAt ?? null, adapterError: r.adapterError ? 'Adapter failed' : null});
  } catch { return reply({error: 'Analytics refresh failed. Previous readings are kept.'}, 503); }
}

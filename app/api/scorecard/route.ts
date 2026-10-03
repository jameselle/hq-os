import {NextRequest, NextResponse} from 'next/server';
import {localHost, localLifecycleOrigin} from '@/lib/lifecycle';
import {runScorecard, scorecardState} from '@/lib/scorecard';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export async function GET(req: NextRequest) {
  if (!localHost(req.headers.get('host'))) return reply({error: 'Local request required'}, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  return reply(p ? {business: p.name, ...scorecardState(p.slug)} : {business: null, connected: false, snapshot: null, stale: true});
}
export async function POST(req: NextRequest) {
  if (!localLifecycleOrigin(req.headers.get('origin'), req.headers.get('host'))) return reply({error: 'Local same-origin request required'}, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if (!p) return reply({error: 'Choose a business'}, 400);
  const body = await req.json().catch(() => null);
  if (body?.action !== 'refresh') return reply({error: 'Invalid action'}, 400);
  try { return reply({business: p.name, ...await runScorecard(p.slug)}); }
  catch { return reply({error: 'Connection unavailable. Previous snapshot is kept.'}, 503); }
}

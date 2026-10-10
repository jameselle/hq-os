// The Dashboard's data: GET the current business's snapshot (held in memory, refreshed every minute), POST to
// refresh, read a customer's notes, add a note or set their contact status. Local requests only; writes need a
// same-origin request from this Mac.
import {NextRequest, NextResponse} from 'next/server';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {localHost, localLifecycleOrigin} from '@/lib/lifecycle';
import {addDashboardNote, dashboardConnected, dashboardNotes, getDashboard, setDashboardContact} from '@/lib/dashboard-store';

export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export async function GET(req: NextRequest) {
  if (!localHost(req.headers.get('host'))) return reply({error: 'Local request required'}, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if (!p) return reply({business: null, connected: false, snapshot: null});
  if (!dashboardConnected(p.slug)) return reply({business: p.name, connected: false, snapshot: null});
  try {
    const {snapshot, heldFor} = await getDashboard(p.slug);
    return reply({business: p.name, connected: true, snapshot, heldFor});
  } catch (e) {
    return reply({business: p.name, connected: true, snapshot: null, error: message(e, 'The dashboard could not load')}, 503);
  }
}

export async function POST(req: NextRequest) {
  if (!localLifecycleOrigin(req.headers.get('origin'), req.headers.get('host'))) return reply({error: 'Local same-origin request required'}, 403);
  const p = resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if (!p) return reply({error: 'Choose a business'}, 400);
  if (!dashboardConnected(p.slug)) return reply({error: `${p.name} has no dashboard connection`}, 400);
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  try {
    switch (body?.action) {
      case 'refresh': {
        const {snapshot} = await getDashboard(p.slug, {force: true});
        return reply({business: p.name, connected: true, snapshot, heldFor: 0});
      }
      case 'notes':
        return reply({notes: await dashboardNotes(p.slug, key)});
      case 'add-note':
        await addDashboardNote(p.slug, key, String(body.note ?? ''));
        return reply({notes: await dashboardNotes(p.slug, key)});
      case 'set-contact':
        await setDashboardContact(p.slug, key, String(body.status ?? ''));
        return reply({ok: true});
      default:
        return reply({error: 'Invalid action'}, 400);
    }
  } catch (e) {
    return reply({error: message(e, 'That did not work')}, body?.action === 'refresh' ? 503 : 400);
  }
}

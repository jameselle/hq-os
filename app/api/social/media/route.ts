// Serves a rendered social card (PNG) of the current business to this Mac's browser only, so the owner can see and
// save it. Only files inside the business's social/media folder.
import fs from 'node:fs';
import {NextRequest,NextResponse} from 'next/server';
import {localHost} from '@/lib/lifecycle';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {mediaPath} from '@/lib/social-store';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  if(!localHost(req.headers.get('host')))return NextResponse.json({error:'Local request required'},{status:403});
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  const file=p?mediaPath(p.slug,req.nextUrl.searchParams.get('f')??''):null;
  if(!file)return NextResponse.json({error:'Not found'},{status:404});
  return new NextResponse(fs.readFileSync(file),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
}

// Serves a rendered social card (PNG) or slideshow Reel (MP4) of the current business to this Mac's browser only, so the
// owner can see, hear and save it. Only files inside the business's social/media folder. Videos answer byte ranges
// (Safari won't play one otherwise).
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
  const f=req.nextUrl.searchParams.get('f')??'',video=f.endsWith('.mp4');
  const file=p?mediaPath(p.slug,f,video?'.mp4':'.png'):null;
  if(!file)return NextResponse.json({error:'Not found'},{status:404});
  if(!video)return new NextResponse(fs.readFileSync(file),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
  const buf=fs.readFileSync(file),m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range')??'');
  if(!m||(!m[1]&&!m[2]))return new NextResponse(buf,{headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'no-store'}});
  const start=m[1]?Number(m[1]):Math.max(0,buf.length-Number(m[2])),end=m[1]&&m[2]?Math.min(Number(m[2]),buf.length-1):buf.length-1;
  if(start>end||start>=buf.length)return new NextResponse(null,{status:416,headers:{'Content-Range':`bytes */${buf.length}`}});
  return new NextResponse(buf.subarray(start,end+1),{status:206,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${buf.length}`,'Cache-Control':'no-store'}});
}

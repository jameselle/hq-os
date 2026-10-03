import {NextRequest,NextResponse} from 'next/server';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {brandAsset} from '@/lib/brand';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  const file=req.nextUrl.searchParams.get('file')||'';
  const bytes=p?brandAsset(p.slug,file):null;
  if(!bytes)return new NextResponse('Not found',{status:404});
  const inline=file.endsWith('.png')&&req.nextUrl.searchParams.get('preview')==='1';
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':inline?'image/png':'application/octet-stream','Content-Disposition':`${inline?'inline':'attachment'}; filename="${file}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}

import {NextRequest,NextResponse} from 'next/server';
import {localHost,localLifecycleOrigin} from '@/lib/lifecycle';
import {BUSINESS_COOKIE} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {collectTrends,radar,saveNiches} from '@/lib/trend-store';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 if(!localHost(req.headers.get('host')))return reply({error:'Local request required'},403);
 const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
 if(!p)return reply({error:'Choose a business'},400);
 try{return reply(radar(p.slug));}catch{return reply({error:'Saved radar data could not be read.'},500);}
}
export async function POST(req:NextRequest){
 if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);
 const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
 if(!p)return reply({error:'Choose a business'},400);
 const body=await req.json().catch(()=>null);
 try{
  if(body?.action==='configure')saveNiches(p.slug,body.niches);
  else if(body?.action==='scan')await collectTrends(p.slug,{force:true});
  else return reply({error:'Unknown action'},400);
  return reply(radar(p.slug));
 }catch(e){return reply({error:e instanceof Error?e.message:'Scan failed; previous measurements retained.'},409);}
}

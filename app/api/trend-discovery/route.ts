import {NextRequest,NextResponse} from 'next/server';
import {localHost,localLifecycleOrigin} from '@/lib/lifecycle';
import {BUSINESS_COOKIE} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {readDiscoveries,startDiscovery,watchDiscovered} from '@/lib/trend-discovery';
import {readSchedules,saveSchedule,toggleSchedule,discoveryDefaults} from '@/lib/trend-automation';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 if(!localHost(req.headers.get('host')))return reply({error:'Local request required'},403);
 const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);if(!p)return reply({error:'Choose a business'},400);
 return reply({runs:readDiscoveries(p.slug),schedules:readSchedules(p.slug),defaults:discoveryDefaults(p.slug)});
}
export async function POST(req:NextRequest){
 if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);
 const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);if(!p)return reply({error:'Choose a business'},400);
 const body=await req.json().catch(()=>null);
 try{
  if(body?.action==='discover')startDiscovery(p.slug,body);
  else if(body?.action==='schedule')saveSchedule(p.slug,body);
  else if(body?.action==='toggle-schedule')toggleSchedule(p.slug,body.id,body.enabled);
  else if(body?.action==='watch')watchDiscovered(p.slug,body.id,body.handles);
  else return reply({error:'Unknown action'},400);
  return reply({runs:readDiscoveries(p.slug),schedules:readSchedules(p.slug),defaults:discoveryDefaults(p.slug)});
 }catch(e){return reply({error:e instanceof Error?e.message:'Discovery failed'},409);}
}

import {NextRequest,NextResponse} from 'next/server';
import {lifecycleState,runLifecycle,localLifecycleOrigin,localHost} from '@/lib/lifecycle';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {addNote,setNoteDone} from '@/lib/lifecycle-notes';
import {markRivalSeen} from '@/lib/rivals-seen';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
  if(!localHost(req.headers.get('host')))return reply({error:'Local request required'},403);
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  return reply(p?{business:p.name,...lifecycleState(p.slug)}:{business:null,connected:false,snapshot:null,stale:true});
}
export async function POST(req:NextRequest){
  if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if(!p)return reply({error:'Choose a business'},400);
  const body=await req.json().catch(()=>null);
  // Notes stay in HQ (and the vault); they never reach the business's engine.
  if(body?.action==='note'){
    try{return reply({note:addNote(p.slug,{flow:String(body.flow??''),message:typeof body.message==='string'?body.message:null,text:String(body.text??'')})});}
    catch(e){return reply({error:e instanceof Error?e.message:'Could not save the note'},400);}
  }
  if(body?.action==='rival-seen'){
    try{markRivalSeen(p.slug,String(body.uuid??''),String(body.lastChanged??''));return reply({ok:true});}
    catch(e){return reply({error:e instanceof Error?e.message:'Could not update'},400);}
  }
  if(body?.action==='note-done'){
    try{return reply({note:setNoteDone(p.slug,String(body.id??''),body.done!==false)});}
    catch(e){return reply({error:e instanceof Error?e.message:'Could not update the note'},400);}
  }
  if(!['report','pause','resume','approve','reject','test','mode'].includes(body?.action))return reply({error:'Invalid action'},400);
  const opts={workflow:typeof body.workflow==='string'?body.workflow:undefined,before:typeof body.before==='string'?body.before:undefined,mode:typeof body.mode==='string'?body.mode:undefined};
  try{return reply({business:p.name,...await runLifecycle(p.slug,body.action,opts)});}
  catch{return reply({error:'Connection unavailable. Previous snapshot is not current.'},503);}
}

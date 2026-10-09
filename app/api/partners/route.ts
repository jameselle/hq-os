// The Partnerships page's actions on outreach drafts: approve (with the compliance check acknowledged where needed),
// back to draft, "Mark as sent" (the owner sent a DM or a form), retry a failed email, approve every email draft of a
// campaign, and record an opt-out. Approving an email draft is what lets HQ send it; nothing here sends anything.
// Local same-origin requests only; the business comes from the switcher cookie, never from the body.
import {NextRequest,NextResponse} from 'next/server';
import {localLifecycleOrigin} from '@/lib/lifecycle';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {approveDraft,approveEmailDrafts,markSentByOwner,optOut,retryDraft,unapproveDraft} from '@/lib/partner-store';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
  if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if(!p)return reply({error:'Choose a business'},400);
  const body=await req.json().catch(()=>null);
  const id=String(body?.id??''),n=Number(body?.n);
  const ok=(x:{id:string;status:string})=>reply({partner:x.id,status:x.status});
  try{
    switch(body?.action){
      case 'approve':return ok(approveDraft(p.slug,id,n,new Date(),{ackCheck:body?.ackCheck===true}));
      case 'unapprove':return ok(unapproveDraft(p.slug,id,n));
      case 'sent':return ok(markSentByOwner(p.slug,id,n));
      case 'retry':return ok(retryDraft(p.slug,id,n));
      case 'optout':return ok(optOut(p.slug,id,typeof body?.note==='string'?body.note:undefined));
      case 'approve-all':return reply(approveEmailDrafts(p.slug,String(body?.campaign??'')));
      default:return reply({error:'Invalid action'},400);
    }
  }catch(e){return reply({error:e instanceof Error?e.message:'Could not update'},400);}
}

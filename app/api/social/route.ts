// The Content & Social page's actions on the week's posts: approve, reject, reopen, note, "I posted it", mode; and on
// the comment-reply queue: approve (with an edit) or reject.
// Local same-origin requests only; the business comes from the switcher cookie, never from the body.
import {NextRequest,NextResponse} from 'next/server';
import {localLifecycleOrigin} from '@/lib/lifecycle';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {addSocialNote,markPosted,readSocialConfig,setSocialStatus,writeSocialConfig} from '@/lib/social-store';
import {approveReply,rejectReply} from '@/lib/social-replies-store';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
  if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if(!p)return reply({error:'Choose a business'},400);
  const body=await req.json().catch(()=>null);
  const id=String(body?.id??'');
  try{
    switch(body?.action){
      case 'approve':return reply({draft:setSocialStatus(p.slug,id,'approved')});
      case 'reject':return reply({draft:setSocialStatus(p.slug,id,'rejected')});
      case 'reopen':return reply({draft:setSocialStatus(p.slug,id,'draft')});
      case 'note':return reply({draft:addSocialNote(p.slug,id,String(body?.text??''))});
      case 'posted':return reply({draft:markPosted(p.slug,id,String(body?.url??'').trim())});
      // Comment replies: the owner's yes (optionally with their own wording) or no. Posting happens in the hourly run.
      case 'reply-approve':return reply({reply:approveReply(p.slug,id,typeof body?.text==='string'?body.text:undefined)});
      case 'reply-reject':return reply({reply:rejectReply(p.slug,id)});
      case 'mode':{
        const c=readSocialConfig(p.slug);
        if(!c)return reply({error:'No social plan set up'},400);
        if(!['off','draft','auto'].includes(body?.mode))return reply({error:'Invalid mode'},400);
        writeSocialConfig(p.slug,{...c,mode:body.mode});return reply({mode:body.mode});
      }
      default:return reply({error:'Invalid action'},400);
    }
  }catch(e){return reply({error:e instanceof Error?e.message:'Could not update'},400);}
}

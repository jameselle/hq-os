// The SEO page's actions on the daily blog: approve, reject or reopen a draft, add a note, switch the mode.
// Local same-origin requests only; the business comes from the switcher cookie, never from the body.
import {NextRequest,NextResponse} from 'next/server';
import {localLifecycleOrigin} from '@/lib/lifecycle';
import {resolveCurrent} from '@/lib/store';
import {BUSINESS_COOKIE} from '@/lib/current';
import {addNote,readBlogConfig,setStatus,writeBlogConfig} from '@/lib/blog-store';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
  if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);
  const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);
  if(!p)return reply({error:'Choose a business'},400);
  const body=await req.json().catch(()=>null);
  const draft=String(body?.draft??'');
  try{
    switch(body?.action){
      case 'approve':return reply({draft:setStatus(p.slug,draft,'approved').meta});
      case 'reject':return reply({draft:setStatus(p.slug,draft,'rejected').meta});
      case 'reopen':return reply({draft:setStatus(p.slug,draft,'draft').meta});
      case 'note':return reply({draft:addNote(p.slug,draft,String(body?.text??'')).meta});
      case 'mode':{
        const c=readBlogConfig(p.slug);
        if(!c)return reply({error:'No blog set up'},400);
        if(!['off','draft','auto'].includes(body?.mode))return reply({error:'Invalid mode'},400);
        writeBlogConfig(p.slug,{...c,mode:body.mode});
        return reply({mode:body.mode});
      }
      default:return reply({error:'Invalid action'},400);
    }
  }catch(e){return reply({error:e instanceof Error?e.message:'Could not update'},400);}
}

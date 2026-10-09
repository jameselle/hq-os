// Content & Social: the week's posts for every network, from the business's channel plan. It leads with what needs
// the owner (each post with its cards, caption, checks and approve / reject / note; posts the owner puts out by hand
// get "I posted it"; posts HQ couldn't put out show why), then the rest of the week with links to the live posts, then
// (when the business opts in) the comment-reply queue: drafted replies to approve, edit or reject, and reel ideas. The department's tools and publishing stay a tab.
import Link from 'next/link';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {asSlideshow,decideSocial,socialDecisionText,LIMITS} from '@/lib/social';
import {listSocial,readSocialConfig} from '@/lib/social-store';
import {channelPlan} from '@/lib/social-writer';
import {PostActions,ReplyActions,SocialMode} from '@/components/SocialControls';
import {repliesConfig,REPLY_MAX} from '@/lib/social-replies';
import {readQueue} from '@/lib/social-replies-store';
import {BUCKET_TONE,PILL} from '@/lib/tone';
import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';
const NET:Record<string,string>={instagram:'Instagram',tiktok:'TikTok',x:'X',linkedin:'LinkedIn',pinterest:'Pinterest',youtube:'YouTube',facebook:'Facebook',threads:'Threads',discord:'Discord'};
const day=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});

export default async function ContentPage({searchParams:query}:{searchParams:Promise<{tab?:string}>}){
 const tab=(await query).tab==='tools'?'tools':'week';
 const p=resolveCurrent(await preferredBusiness());
 const c=p?readSocialConfig(p.slug):null;
 const now=new Date();
 const posts=p?listSocial(p.slug,2):[];
 const open=c?posts.filter(d=>['wait','blocked','hand','publish','failed'].includes(decideSocial(c,d,now))):[];
 const rest=c?posts.filter(d=>!open.includes(d)):[];
 const plan=p?Boolean(channelPlan(p.slug)):false;
 const weekOne=c?.approveUntil&&now<new Date(c.approveUntil);
 // Comment replies (opt-in): drafts wait here for the owner; approved ones post at the next hourly run.
 const rq=repliesConfig(c),queue=p?readQueue(p.slug):[];
 const rDrafts=queue.filter(x=>x.status==='draft'||x.status==='failed'),rWaiting=queue.filter(x=>x.status==='approved');
 const reels=queue.filter(x=>x.reelIdea&&x.status!=='rejected').slice(-12).reverse();
 const rCount=(s:string)=>queue.filter(x=>x.status===s).length;
 return <div className="space-y-6 min-w-0">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><h1 className="text-2xl font-semibold">Content & Social{p&&<span className="text-bb-muted font-normal text-[17px]"> · {p.name}</span>}</h1>
    <p className="text-[13px] text-bb-muted mt-1 max-w-[72ch]">This week&apos;s posts for every network, drafted from the channel plan and what actually happened. Approve them here; HQ posts its networks by itself on each post&apos;s day, and you post the rest by hand.</p></div>
   {tab==='week'&&c&&<SocialMode mode={c.mode}/>}
  </header>
  <nav aria-label="Content views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">{(['week','tools'] as const).map(t=><Link key={t} href={`/content?tab=${t}`} aria-current={tab===t?'page':undefined} className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab===t?'border-bb-teal text-bb-fg':'border-transparent text-bb-muted hover:text-bb-fg'}`}>{t==='week'?'This week':'Tools, skills & publishing'}{t==='week'&&open.length>0&&<span className="ml-1.5 rounded-full bg-bb-warn/20 px-1.5 text-[11px] text-bb-warn">{open.length}</span>}</Link>)}</nav>
  {tab==='tools'?<DepartmentPage params={{dept:'content'}} embedded/>
  :!p?<p className="card px-4 py-3 text-[12.5px] text-bb-muted">Choose a business.</p>
  :!c?<section className="card space-y-2 p-4"><h2 className="text-[15px] font-semibold">No weekly social plan yet</h2>
    <p className="max-w-[80ch] text-[12.5px] text-bb-muted">{plan?'The channel plan is in the vault. ':'Write a channel plan first (Departments/Content & Social/Channel plan.md in the vault). '}Then set it up with <span className="font-mono">npm run hq -- social setup {p.slug} --networks instagram:hq,x:hand</span>. <Link href="/guides/social" className="text-bb-blue hover:underline">How to set it up</Link></p></section>
  :<div className="space-y-7">
   <section aria-labelledby="week-h" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
     <h2 id="week-h" className="text-lg font-semibold">{open.length?`Needs you (${open.length})`:'Nothing needs you right now'}</h2>
     <span className="text-[11.5px] text-bb-dim">{Object.entries(c.networks).map(([n,v])=>`${NET[n]??n}: ${v?.posting==='hq'?'HQ posts':v?.posting==='hand'?'you post':'another tool'}`).join(' · ')}{weekOne?` · week one until ${c.approveUntil!.slice(0,10)}`:''}</span>
    </div>
    {open.length?<div className="grid gap-3 xl:grid-cols-2">{open.map(d=>{const what=decideSocial(c,d,now);const failing=(d.checks??[]).filter(x=>!x.ok);const caption=`${d.caption}${d.hashtags.length?`\n\n${d.hashtags.map(h=>`#${h.replace(/^#/,'')}`).join(' ')}`:''}`;
     return <article key={d.id} className="card space-y-3 p-4 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[14px] font-semibold">{NET[d.network]??d.network} · {d.format}</h3><span className="text-[12px] text-bb-dim">{day(d.day)}{d.keyword?` · keyword ${d.keyword}`:''}</span></div>
      {d.reel&&asSlideshow(c,d)?<figure className="space-y-1"><video src={`/api/social/media?f=${encodeURIComponent(d.reel.path)}`} controls playsInline preload="metadata" className="h-80 rounded-lg border border-bb-border bg-black"/><figcaption className="text-[11.5px] text-bb-dim">Goes out as a Reel: {d.reel.seconds} s, music {d.reel.track}. Instagram can&apos;t put music on a carousel.</figcaption></figure>
      :d.media?.length?<div className="flex gap-2 overflow-x-auto pb-1">{d.media.map(m=><a key={m} href={`/api/social/media?f=${encodeURIComponent(m)}`} target="_blank" rel="noreferrer" className="shrink-0"><img src={`/api/social/media?f=${encodeURIComponent(m)}`} alt="" className="h-48 rounded-lg border border-bb-border"/></a>)}</div>:null}
      {d.video?.brief&&<p className="rounded-lg bg-bb-blue/5 px-3 py-2 text-[12.5px] text-bb-blue">Video to record: {d.video.brief}</p>}
      <p className="whitespace-pre-wrap rounded-lg bg-bb-surface2/50 px-3 py-2 text-[12.5px]">{caption}</p>
      <p className="text-[11.5px] text-bb-dim">{caption.length}/{LIMITS[d.network].caption} characters{d.link?` · link ${d.link}`:''} · {d.why}</p>
      <p className={`rounded-lg px-3 py-2 text-[12.5px] ${what==='failed'?'bg-bb-danger/10 text-bb-danger':failing.length||(what==='publish'&&d.error)?'bg-bb-warn/10 text-bb-warn':'bg-bb-surface2/50 text-bb-muted'}`}>{socialDecisionText(c,d,now)}</p>
      {(d.attempts??[]).length>0&&<p className="text-[11.5px] text-bb-dim">HQ tried {d.attempts!.length} {d.attempts!.length===1?'time':'times'}, last at {new Date(d.attempts!.at(-1)!.at).toLocaleString('en-AU',{weekday:'short',hour:'numeric',minute:'2-digit'})}.</p>}
      {failing.length>0&&<ul className="text-[12px] text-bb-warn">{failing.map(x=><li key={x.id}>✗ {x.label}: {x.detail}</li>)}</ul>}
      {(d.notes??[]).length>0&&<ul className="space-y-1">{d.notes!.map(x=><li key={x.at} className="rounded-lg border border-bb-blue/30 bg-bb-blue/5 px-3 py-2 text-[12.5px]">{x.text}</li>)}</ul>}
      <PostActions id={d.id} status={d.status} blocked={what==='blocked'} why="A check is failing: reject it or leave a note for next week." hand={(c.networks[d.network]?.posting??'hand')==='hand'} caption={caption}/>
     </article>;})}</div>
    :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">No posts waiting. Next week&apos;s drafts are written {['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][c.weekday??1]} from {c.hour??7}:00.</p>}
   </section>
   {rest.length>0&&<section aria-labelledby="rest-h" className="space-y-2"><h2 id="rest-h" className="text-lg font-semibold">Done this week</h2>
    <ul className="card divide-y divide-bb-border/60 px-4 py-1">{rest.map(d=><li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[12.5px]"><span>{NET[d.network]??d.network} · {d.format} · {day(d.day)}</span>{d.url?<a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-bb-accent hover:underline">{(d.attempts??[]).length?'Posted by HQ':'Posted'}{d.postedAt?` ${new Date(d.postedAt).toLocaleString('en-AU',{weekday:'short',hour:'numeric',minute:'2-digit'})}`:''}: view post ↗</a>:<span className="text-bb-dim">{d.status}</span>}</li>)}</ul></section>}
   {(rq||queue.length>0)&&<section aria-labelledby="replies-h" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
     <h2 id="replies-h" className="text-lg font-semibold">Comment replies{rDrafts.length?` (${rDrafts.length})`:''}</h2>
     <span className="text-[11.5px] text-bb-dim">{rq?'Instagram, checked hourly':'Switched off'} · {rWaiting.length} approved and waiting · {rCount('posted')} posted · {rCount('skipped')} needed no reply{rCount('new')?` · ${rCount('new')} being drafted`:''}</span>
    </div>
    <p className="max-w-[80ch] text-[12.5px] text-bb-muted">HQ reads new comments on the account&apos;s recent posts every hour and drafts a reply to the ones worth answering. Nothing is posted until you approve it; approved replies go up at the next hourly run. Comments with a comment-to-DM keyword are left to that bot. <Link href="/guides/social" className="text-bb-blue hover:underline">How it works</Link></p>
    {rDrafts.length?<div className="grid gap-3 xl:grid-cols-2">{rDrafts.map(x=><article key={x.id} className="card space-y-2 p-4 min-w-0">
     <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[14px] font-semibold">@{x.username}</h3><span className="flex flex-wrap items-center gap-2">{x.bucket&&<span className={`${PILL} ${BUCKET_TONE[x.bucket]??''}`}>{x.bucket.toLowerCase()}</span>}{x.reelIdea&&<span className={`${PILL} ${BUCKET_TONE.QUESTION}`}>reel idea</span>}{x.permalink&&<a href={x.permalink} target="_blank" rel="noopener noreferrer" className="text-[12px] text-bb-blue hover:underline">on this post ↗</a>}</span></div>
     <p className="whitespace-pre-wrap rounded-lg bg-bb-surface2/50 px-3 py-2 text-[12.5px]">{x.comment}</p>
     {x.why&&<p className="text-[11.5px] text-bb-dim">{x.why}</p>}
     {x.status==='failed'&&<p className="rounded-lg bg-bb-danger/10 px-3 py-2 text-[12.5px] text-bb-danger">HQ couldn&apos;t {x.reply?'post':'draft'} it{x.error?`: ${x.error}`:'.'} {x.reply?'Approve it again to retry.':'Write a reply and approve it, or reject it.'}</p>}
     <ReplyActions id={x.id} reply={x.reply??''} status={x.status} max={REPLY_MAX}/>
    </article>)}</div>
    :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">No replies waiting for you.</p>}
    {rWaiting.length>0&&<ul className="card divide-y divide-bb-border/60 px-4 py-1">{rWaiting.map(x=><li key={x.id} className="space-y-0.5 py-2.5 text-[12.5px]"><p><span className="text-bb-dim">@{x.username}:</span> {x.reply}</p><p className="text-[11.5px] text-bb-dim">Approved, posts at the next hourly run{x.error?`. Last try: ${x.error}`:''}</p></li>)}</ul>}
    {reels.length>0&&<div className="space-y-2"><h3 className="text-[14px] font-semibold">Reel ideas from the comments</h3>
     <p className="text-[12px] text-bb-muted">Questions lots of people likely have. Answer one with a reel that replies to the comment.</p>
     <ul className="card divide-y divide-bb-border/60 px-4 py-1">{reels.map(x=><li key={x.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[12.5px]"><span>&ldquo;{x.comment}&rdquo; <span className="text-bb-dim">@{x.username}</span></span>{x.permalink&&<a href={x.permalink} target="_blank" rel="noopener noreferrer" className="text-[12px] text-bb-blue hover:underline">on this post ↗</a>}</li>)}</ul></div>}
   </section>}
  </div>}
 </div>;
}

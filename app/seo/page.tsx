// SEO & GEO: the daily blog and whether search and AI answer engines can find the business. It leads with the drafts
// that need the owner (each with its checks, why the topic was picked and the post itself), then the published posts,
// the search numbers and the GEO basics per site. The department's tools stay a tab.
import Link from 'next/link';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {decide,decisionText} from '@/lib/blog';
import {blogHtml} from '@/lib/blog-html';
import {hasPublisher,listDrafts,readBlogConfig,readLog} from '@/lib/blog-store';
import {siteChecks} from '@/lib/geo';
import {analyticsBoard} from '@/lib/analytics';
import {BlogMode,DraftActions} from '@/components/BlogControls';
import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';

const day=(iso?:string,tz?:string)=>iso?new Date(iso).toLocaleDateString('en-AU',{day:'numeric',month:'short',timeZone:tz}):'';
const n=(x:number)=>x.toLocaleString('en-AU');

export default async function SeoPage({searchParams:query}:{searchParams:Promise<{tab?:string}>}){
 const tab=(await query).tab==='tools'?'tools':'overview';
 const p=resolveCurrent(await preferredBusiness());
 const cfg=p?readBlogConfig(p.slug):null;
 const now=new Date();
 const drafts=p?listDrafts(p.slug):[];
 const open=cfg?drafts.filter(d=>{const x=decide(cfg,d.meta,now);return x==='wait'||x==='blocked'||(x==='publish'&&!d.meta.url)||d.meta.status==='failed';}):[];
 const published=drafts.filter(d=>d.meta.status==='published');
 const log=p?readLog(p.slug,12).reverse():[];
 const sites=p?[...new Set([...(cfg?[cfg.site]:[]),...(p.sites??[])])].filter(s=>/^https:\/\//.test(s)).slice(0,3):[];
 const geo=tab==='overview'?await Promise.all(sites.map(async s=>({site:s,checks:await siteChecks(s)}))):[];
 const board=p?(()=>{try{return analyticsBoard(p.slug);}catch{return null;}})():null;
 const num=(id:string)=>board?.metrics.find(m=>m.id===id);
 const weekOne=cfg?.approveUntil&&now<new Date(cfg.approveUntil);

 return <div className="space-y-6 min-w-0">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><h1 className="text-2xl font-semibold">SEO & GEO{p&&<span className="text-bb-muted font-normal text-[17px]"> · {p.name}</span>}</h1>
    <p className="text-[13px] text-bb-muted mt-1 max-w-[72ch]">Gets the business found in Google and cited by AI answers. A researched post goes out each day; what needs you is at the top.</p></div>
   {tab==='overview'&&cfg&&<BlogMode mode={cfg.mode}/>}
  </header>
  <nav aria-label="SEO views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">{(['overview','tools'] as const).map(t=><Link key={t} href={`/seo?tab=${t}`} aria-current={tab===t?'page':undefined} className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab===t?'border-bb-teal text-bb-fg':'border-transparent text-bb-muted hover:text-bb-fg'}`}>{t==='overview'?'Blog & search':'Tools & skills'}{t==='overview'&&open.length>0&&<span className="ml-1.5 rounded-full bg-bb-warn/20 px-1.5 text-[11px] text-bb-warn">{open.length}</span>}</Link>)}</nav>

  {tab==='tools'?<DepartmentPage params={{dept:'seo'}} embedded/>
  :!p?<p className="card px-4 py-3 text-[12.5px] text-bb-muted">Choose a business.</p>
  :<div className="space-y-7">
   {!cfg?<section className="card space-y-2 p-4">
     <h2 className="text-[15px] font-semibold">No daily blog yet</h2>
     <p className="max-w-[80ch] text-[12.5px] text-bb-muted">Each day HQ can research one topic with real search demand, write a sourced post in {p.name}&apos;s voice, check it, and publish it when you allow. Set it up with <span className="font-mono">npm run hq -- blog setup {p.slug} --site https://…</span>, then connect a publisher for the site. <Link href="/guides/blog" className="text-bb-blue hover:underline">How to set it up</Link></p>
   </section>
   :<section aria-labelledby="blog-h" className="space-y-3">
     <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="blog-h" className="text-lg font-semibold">{open.length?`Needs you (${open.length})`:'Nothing needs you right now'}</h2>
      <span className="text-[11.5px] text-bb-dim">{cfg.site.replace(/^https:\/\//,'')} · daily from {cfg.hour??6}:00{weekOne?` · week one until ${day(cfg.approveUntil,p.timezone)}: every post waits for you`:''}{hasPublisher(p.slug)?'':' · no publisher connected yet'}</span>
     </div>
     {open.length?<div className="grid gap-3 xl:grid-cols-2">{open.map(d=>{
       const failing=(d.meta.checks??[]).filter(c=>!c.ok);
       const what=decide(cfg,d.meta,now);
       return <article key={d.file} className="card space-y-3 p-4 min-w-0">
        <div className="space-y-1">
         <h3 className="text-[15px] font-semibold leading-snug">{d.meta.title}</h3>
         <p className="text-[12px] text-bb-dim">{day(d.meta.date,p.timezone)} · targets “{d.meta.keyword}” · {(d.markdown.match(/\S+/g)??[]).length} words · {d.meta.sources.length} sources</p>
         {d.meta.why&&<p className="text-[12.5px] text-bb-muted">Why this topic: {d.meta.why}</p>}
        </div>
        <p className={`rounded-lg px-3 py-2 text-[12.5px] ${failing.length||d.meta.status==='failed'?'bg-bb-warn/10 text-bb-warn':'bg-bb-surface2/50 text-bb-muted'}`}>{d.meta.status==='failed'?`Couldn't publish: ${d.meta.error??'unknown error'}`:decisionText(cfg,d.meta,now)}</p>
        {d.meta.checks?.length?<ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[12px]">{d.meta.checks.map(c=><li key={c.id} className={c.ok?'text-bb-muted':'text-bb-warn'}>{c.ok?'✓':'✗'} {c.label}{c.ok?'':`: ${c.detail}`}</li>)}</ul>:<p className="text-[12px] text-bb-dim">Checks run within the hour.</p>}
        <details className="rounded-lg border border-bb-border/60 px-3 py-2"><summary className="cursor-pointer text-[12.5px] text-bb-muted hover:text-bb-fg">Read the post</summary>
         <div className="prose-blog mt-2 max-w-none space-y-2 text-[13px] leading-relaxed [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:font-semibold [&_a]:text-bb-blue [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:text-[12px] [&_td]:border [&_td]:border-bb-border [&_td]:px-2 [&_th]:border [&_th]:border-bb-border [&_th]:px-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-bb-muted" dangerouslySetInnerHTML={{__html:blogHtml(d.markdown)}}/>
         {d.meta.faq.length>0&&<div className="mt-3 space-y-1 text-[12.5px]"><p className="font-semibold">FAQ</p>{d.meta.faq.map(f=><p key={f.q}><span className="font-medium">{f.q}</span> {f.a}</p>)}</div>}
         <ol className="mt-3 list-decimal pl-5 text-[12px] text-bb-muted">{d.meta.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-bb-blue">{s.title}</a></li>)}</ol>
        </details>
        {(d.meta.notes??[]).length>0&&<ul className="space-y-1">{d.meta.notes!.map(x=><li key={x.at} className="rounded-lg border border-bb-blue/30 bg-bb-blue/5 px-3 py-2 text-[12.5px]">{x.text} <span className="text-[11px] text-bb-dim">· {x.at.slice(0,10)}</span></li>)}</ul>}
        <DraftActions draft={d.file} title={d.meta.title} status={d.meta.status} blocked={what==='blocked'} why="A check is failing: it can't be published until the writer fixes it or you reject it."/>
       </article>;})}</div>
     :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">No drafts waiting. {cfg.mode==='off'?'The blog is off.':`The next post is researched after ${cfg.hour??6}:00.`}</p>}
   </section>}

   {published.length>0&&<section aria-labelledby="pub-h" className="space-y-2">
     <h2 id="pub-h" className="text-lg font-semibold">Published ({published.length})</h2>
     <ul className="card divide-y divide-bb-border/60 px-4 py-1">{published.slice(0,15).map(d=><li key={d.file} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"><a href={d.meta.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-bb-blue">{d.meta.title}</a><span className="text-[11.5px] text-bb-dim">{day(d.meta.publishedAt,p.timezone)} · “{d.meta.keyword}”</span></li>)}</ul>
   </section>}

   <section aria-labelledby="search-h" className="space-y-2">
    <h2 id="search-h" className="text-lg font-semibold">Search</h2>
    <div className="grid gap-3 sm:grid-cols-3">{(['search_clicks','organic_signups','blog_posts'] as const).map(id=>{const m=num(id);return <div key={id} className="card space-y-1 px-4 py-3">
     <p className="eyebrow">{m?.def.label??id}</p>
     <p className="text-2xl font-semibold tabular-nums">{m?.value===null||m?.value===undefined?'—':n(m.value)}</p>
     <p className="text-[11.5px] text-bb-dim">{m?.note||'Not measured yet'}</p></div>;})}</div>
    <p className="text-[11.5px] text-bb-dim">Every number with its history is on <Link href="/data" className="text-bb-blue hover:underline">Data & Analytics</Link>.</p>
   </section>

   {geo.length>0&&<section aria-labelledby="geo-h" className="space-y-2">
    <h2 id="geo-h" className="text-lg font-semibold">Can search and AI engines read the site?</h2>
    <div className="grid gap-3 lg:grid-cols-2">{geo.map(g=><div key={g.site} className="card space-y-1.5 px-4 py-3">
     <p className="text-[13px] font-medium">{g.site.replace(/^https:\/\//,'')}</p>
     <ul className="space-y-0.5 text-[12.5px]">{g.checks.map(c=><li key={c.id} className={c.ok?'text-bb-muted':'text-bb-warn'}>{c.ok?'✓':'✗'} {c.label}: <span className="text-bb-dim">{c.detail}</span></li>)}</ul></div>)}</div>
   </section>}

   {log.length>0&&<details className="card px-4 py-2.5"><summary className="cursor-pointer text-[12.5px] text-bb-muted hover:text-bb-fg">What the blog did lately</summary>
    <ul className="mt-2 space-y-0.5 text-[12px] text-bb-muted">{log.map((e,i)=><li key={i}><span className="font-mono text-[11px] text-bb-dim">{String(e.at).slice(5,16).replace('T',' ')}</span> {String(e.event)}{e.draft?` · ${e.draft}`:''}{e.why?` · ${e.why}`:''}{e.url?` · ${e.url}`:''}</li>)}</ul>
   </details>}
  </div>}
 </div>;
}

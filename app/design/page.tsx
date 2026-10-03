import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {Download} from 'lucide-react';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {readBrand,brandAsset} from '@/lib/brand';
import {DESIGN_TABS,designTab,designAsset,designReview} from '@/lib/design-navigation';
import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';
const labels={overview:'Overview',guidelines:'Brand Guidelines',assets:'Asset Library',reviews:'Reviews & Handoff',tools:'Tools & Skills'};
export default async function DesignPage({searchParams:query}:{searchParams:Promise<{tab?:string}>}){
 const searchParams=await query;
 const p=resolveCurrent(await preferredBusiness()),kit=p?readBrand(p.slug):null,tab=designTab(searchParams.tab);
 const download=(file:string,label:string)=><a className="inline-flex items-center gap-2 text-sm underline py-2" href={'/api/brand-assets?file='+encodeURIComponent(file)} download={file}><Download size={16}/>{label}</a>;
 return <div className="space-y-6 min-w-0">
  <header><h1 className="text-2xl font-semibold">Design & Brand</h1><p className="text-sm text-bb-muted mt-1">{p?.name||'Choose a business'}</p></header>
  <nav aria-label="Design and brand views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">{DESIGN_TABS.map(t=><Link key={t} href={`/design?tab=${t}`} aria-current={t===tab?'page':undefined} className={`shrink-0 px-4 py-3 text-sm border-b-2 ${t===tab?'border-bb-teal text-bb-fg':'border-transparent text-bb-muted hover:text-bb-fg'}`}>{labels[t]}</Link>)}</nav>
  {tab==='tools'?<DepartmentPage params={{dept:'design'}} embedded/>:!kit?<p className="text-sm text-bb-muted">No brand kit connected for this business.</p>:<>
   <p className="text-sm text-bb-muted">{kit.status} · Updated {kit.updatedAt.slice(0,10)}</p>
   {tab==='overview'&&<><h2 className="text-lg font-semibold">Brand palette</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kit.colors.map((c,i)=><div key={i}><div className="h-16 border border-bb-border rounded" style={{background:c.hex}}/><p className="text-sm mt-2">{c.name} <code>{c.hex}</code></p><p className="text-xs text-bb-muted">{c.use}</p></div>)}</div><div className="flex flex-wrap gap-6 text-sm"><Link className="underline" href="/design?tab=guidelines">Brand voice & usage rules</Link><Link className="underline" href="/design?tab=assets">Logos & social templates</Link><Link className="underline" href="/design?tab=reviews">Review findings & handoff</Link></div></>}
   {tab==='guidelines'&&<section><h2 className="text-lg font-semibold mb-4">Brand guidelines</h2><div className="prose-brief text-sm max-w-4xl"><ReactMarkdown>{kit.guide}</ReactMarkdown></div>{kit.assets.some(a=>a.file==='brand-guide.md')&&download('brand-guide.md','Download brand guide')}</section>}
   {tab==='assets'&&<section><h2 className="text-lg font-semibold mb-4">Asset library</h2><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{kit.assets.filter(a=>designAsset(a.file)).map(a=><article key={a.file} className="border border-bb-border rounded-md p-4 min-w-0">{a.file.endsWith('.png')&&<img src={'/api/brand-assets?preview=1&file='+encodeURIComponent(a.file)} alt={a.label} className="w-full h-52 object-contain bg-white mb-3"/>}<h3 className="text-sm font-medium break-words">{a.label}</h3><p className="text-xs text-bb-muted break-all">{a.file}</p>{download(a.file,'Download')}</article>)}</div>{!kit.assets.some(a=>designAsset(a.file))&&<p>No brand assets yet.</p>}</section>}
   {tab==='reviews'&&<section className="space-y-3"><h2 className="text-lg font-semibold">Reviews & handoff</h2>{kit.assets.filter(a=>designReview(a.file)).map(a=><details key={a.file} className="border-b border-bb-border py-3"><summary className="cursor-pointer font-medium text-sm py-2 capitalize">{a.label}</summary><div className="prose-brief text-sm max-w-4xl py-4"><ReactMarkdown>{p?brandAsset(p.slug,a.file)?.toString('utf8')||'Report unavailable.':''}</ReactMarkdown></div>{download(a.file,'Download report')}</details>)}{!kit.assets.some(a=>designReview(a.file))&&<p className="text-sm text-bb-muted">No review reports connected.</p>}</section>}
  </>}
 </div>;
}

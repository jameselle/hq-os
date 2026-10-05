// The Email & Lifecycle department. Approving, testing, modes and delivery live on the lifecycle
// centre (/lifecycle) and each flow's workflow page; this page points there and keeps what is the
// department's own: the customer stages the adapter reports, the brand's email previews, the account
// view and the department's tools. Old ?tab=workflows and ?tab=delivery links go to the centre.
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {lifecycleState, supports} from '@/lib/lifecycle';
import {flowPage} from '@/lib/lifecycle-names';
import {lifecycleStatus, timeLabel} from '@/lib/lifecycle-status';
import {readBrand} from '@/lib/brand';
import {EMAIL_TABS, MOVED_TABS, emailTab} from '@/lib/email-navigation';
import {BrandPanel} from '@/components/BrandPanel';
import {LifecycleRefresh} from '@/components/LifecycleControls';
import {ModePill} from '@/components/LifecycleStatus';
import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';
const labels={overview:'Overview',previews:'Email previews',accounts:'Accounts',tools:'Tools & Skills'};
const words=(s:string)=>s.replaceAll('_',' ').replace(/^./,(c)=>c.toUpperCase());

export default async function EmailPage({searchParams:query}:{searchParams:Promise<{tab?:string;preview?:string}>}){
 const searchParams=await query;
 if((MOVED_TABS as readonly string[]).includes(searchParams.tab??''))redirect('/lifecycle');
 const p=resolveCurrent(await preferredBusiness());
 const tab=emailTab(searchParams.tab);
 const life=p?(()=>{try{return lifecycleState(p.slug);}catch{return null;}})():null;
 const snap=life?.snapshot??null;
 const tz=p?.timezone;
 const read=snap?.observedAt?`read ${timeLabel(snap.observedAt,tz)}${life?.stale?' (over 5 minutes ago)':''}`:'not read yet';
 const {flows,needs}=lifecycleStatus(snap,{now:Date.now(),tz,stale:life?.stale,failed:snap?.collectionFailed,observedAt:snap?.observedAt??null,canApprove:supports(snap,'approve')});
 return <div className="space-y-6 min-w-0">
  <header><h1 className="text-2xl font-semibold">Email & Lifecycle</h1><p className="text-sm text-bb-muted mt-1">{p?.name||'Choose a business'}</p></header>
  <nav aria-label="Email and lifecycle views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">{EMAIL_TABS.map(t=><Link key={t} href={`/email?tab=${t}`} aria-current={tab===t?'page':undefined} className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab===t?'border-bb-teal text-bb-fg':'border-transparent text-bb-muted hover:text-bb-fg'}`}>{labels[t]}</Link>)}</nav>
  {tab==='tools'?<DepartmentPage params={{dept:'email'}} embedded/>
  :tab==='previews'?<BrandPanel key={`${p?.slug}:${searchParams.preview}`} initialEmail={searchParams.preview} emailsOnly kit={p?readBrand(p.slug):null}/>
  :tab==='accounts'?<section className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Accounts</h2><p className="text-[12.5px] text-bb-muted">One row per account the adapter chooses to show, by a private reference (never an email), with the next email planned for it. Numbers {read}.</p></div><LifecycleRefresh disabled={!life?.connected}/></div>
    {snap?.accounts.length?<div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Account reference','Stage','Requests','Errors','Next email','Why','Preferences'].map(h=><th key={h} className="p-2 whitespace-nowrap border-b border-bb-border">{h}</th>)}</tr></thead><tbody>{snap.accounts.map(a=><tr key={a.id}><td className="p-2 font-mono">{a.id}</td><td className="p-2 whitespace-nowrap">{words(a.stage)}</td><td className="p-2">{a.requests}</td><td className="p-2">{a.errors}</td><td className="p-2">{a.nextEmail||'None planned'}</td><td className="p-2">{words(a.reason)}</td><td className="p-2">{a.suppressed?'Gets nothing (bounced, complained or unsubscribed)':`Getting started ${a.onboarding?'on':'off'} · Updates ${a.updates?'on':'off'}`}</td></tr>)}</tbody></table></div>
      :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">{!p?'Choose a business.':!life?.connected?`${p.name} has no lifecycle connection, so there are no accounts to show.`:`${p.name}'s adapter reports totals only, not accounts. That is the safer choice; the lifecycle centre has every number.`}</p>}
  </section>
  :<div className="space-y-5">
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[15px] font-semibold">Automated emails live on the lifecycle centre</h2>
        <p className="max-w-[80ch] text-[12.5px] text-bb-muted">Approve drafts, send yourself a test and switch a flow between off, draft and auto from each flow&apos;s page. One place for each, so nothing is approved twice.</p></div>
        <Link href="/lifecycle" className="rounded-lg border border-bb-border px-3 py-1.5 text-[12px] text-bb-muted hover:bg-bb-surface hover:text-bb-fg">Open the lifecycle centre</Link>
      </div>
      {flows.length?<ul className="divide-y divide-bb-border/60">{flows.map(s=>{const href=flowPage(s.serves);return <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
        <span className="min-w-0">{href?<Link href={href} className="font-medium hover:text-bb-blue">{s.label}</Link>:<span className="font-medium">{s.label}</span>}<span className="text-bb-muted"> · working? {s.working.headline.toLowerCase()}{s.facts.draftTotal?` · ${s.waiting.headline.toLowerCase()}`:''}</span></span>
        <ModePill mode={s.mode}/></li>;})}</ul>
      :<p className="text-[12.5px] text-bb-muted">{!p?'Choose a business.':!life?.connected?`${p.name} has no lifecycle connection yet. The guide shows how to add one.`:'Connected, but the adapter reports no flows yet.'}</p>}
      {needs.length>0&&<p className="text-[12.5px] text-bb-warn">{needs.length} {needs.length===1?'thing needs':'things need'} you there.</p>}
    </section>
    <section className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Customer stages</h2><p className="max-w-[80ch] text-[12.5px] text-bb-muted">How many people are at each stage, as the business&apos;s own adapter counts them; each row names its own period, and a row without one is a count right now. Numbers {read}.</p></div><LifecycleRefresh disabled={!life?.connected}/></div>
      {snap?.stages.length?<table className="w-full max-w-[44rem] text-[12.5px]"><tbody>{snap.stages.map(r=><tr key={r.label} className="border-b border-bb-border/60"><td className="py-1.5 pr-3">{words(r.label)}</td><td className="py-1.5 text-right tabular-nums font-semibold">{r.count.toLocaleString('en-AU')}</td></tr>)}</tbody></table>
        :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">{!life?.connected?'No lifecycle connection, so no stages.':'The adapter reports no stages.'}</p>}
    </section>
  </div>}
 </div>;
}

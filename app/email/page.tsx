// Email & Lifecycle: one page for every automated email and message. It leads with what needs the owner (each batch of
// drafts with the email itself and approve / reject / test / note, then flows with a problem or a finished week one),
// then every flow on one line with its mode. The department's other views stay as tabs. /lifecycle redirects here;
// a flow's full story (who qualifies, delivery, outcomes against the holdout) is on its workflow page.
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {lifecycleState, supports} from '@/lib/lifecycle';
import {flowPage} from '@/lib/lifecycle-names';
import {dayLabel, lifecycleStatus, timeLabel} from '@/lib/lifecycle-status';
import {buildInbox} from '@/lib/lifecycle-inbox';
import {listNotes} from '@/lib/lifecycle-notes';
import {readBrand} from '@/lib/brand';
import {emailDesigns} from '@/lib/email-designs';
import {EMAIL_TABS, MOVED_TABS, emailTab} from '@/lib/email-navigation';
import {BrandPanel} from '@/components/BrandPanel';
import {LifecycleRefresh, PauseAll} from '@/components/LifecycleControls';
import {DraftCard, IssueCard, ModeChoice, RefreshIfStale, RivalCard} from '@/components/LifecycleInbox';
import {rivalChanges} from '@/lib/rivals';
import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';
const labels={overview:'Needs you',previews:'Email designs',accounts:'Accounts',tools:'Tools & skills'};
const words=(s:string)=>s.replaceAll('_',' ').replace(/^./,(c)=>c.toUpperCase());
const n=(x:number)=>x.toLocaleString('en-AU');
const DOT={good:'bg-bb-accent',warn:'bg-bb-warn',bad:'bg-bb-danger',idle:'bg-bb-dim'} as const;

export default async function EmailPage({searchParams:query}:{searchParams:Promise<{tab?:string;preview?:string}>}){
 const searchParams=await query;
 if((MOVED_TABS as readonly string[]).includes(searchParams.tab??''))redirect('/email');
 const p=resolveCurrent(await preferredBusiness());
 const tab=emailTab(searchParams.tab);
 const life=p?(()=>{try{return lifecycleState(p.slug);}catch{return null;}})():null;
 const snap=life?.snapshot??null;
 const tz=p?.timezone;
 const read=snap?.observedAt?`read ${timeLabel(snap.observedAt,tz)}`:'not read yet';
 const {flows,upcoming}=lifecycleStatus(snap,{now:Date.now(),tz,stale:life?.stale,failed:snap?.collectionFailed,observedAt:snap?.observedAt??null,canApprove:supports(snap,'approve')});
 const inbox=buildInbox(snap,flows);
 const notes=p?listNotes(p.slug):[];
 const connected=Boolean(life?.connected), readOnly=life?.readOnly??true;
 const locked=!connected||readOnly, why=!connected?'No lifecycle connection':readOnly?'Read-only connection: HQ can only watch':'';
 const can={approve:supports(snap,'approve'),reject:supports(snap,'reject'),test:supports(snap,'test')};
 const canMode=supports(snap,'mode');
 const email=flows.filter(s=>s.channel==='email');
 const sum=(k:'sent'|'delivered'|'bounced'|'complained'|'unsubscribed')=>email.reduce((t,s)=>t+s.facts[k],0);
 const rivals=p&&tab==='overview'?await rivalChanges(p.slug):[];
 const needCount=inbox.drafts.length+inbox.issues.length+rivals.length;
 const openNotes=notes.filter(x=>!x.done);
 const canPause=connected&&!readOnly&&snap&&supports(snap,snap.paused?'resume':'pause');
 return <div className="space-y-6 min-w-0">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><h1 className="text-2xl font-semibold">Email & Lifecycle{p&&<span className="text-bb-muted font-normal text-[17px]"> · {p.name}</span>}</h1>
    <p className="text-[13px] text-bb-muted mt-1 max-w-[70ch]">Every email that goes out on its own. What needs you is at the top: read it, then approve, reject or leave a note.</p></div>
   {tab==='overview'&&connected&&<div className="flex flex-wrap items-start gap-2"><LifecycleRefresh/>{snap&&<PauseAll paused={snap.paused} locked={!canPause||Boolean(life?.stale)} why={!canPause?"This business can't pause from HQ":life?.stale?'Refresh first':''}/>}</div>}
  </header>
  <nav aria-label="Email and lifecycle views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">{EMAIL_TABS.map(t=><Link key={t} href={`/email?tab=${t}`} aria-current={tab===t?'page':undefined} className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab===t?'border-bb-teal text-bb-fg':'border-transparent text-bb-muted hover:text-bb-fg'}`}>{labels[t]}{t==='overview'&&needCount>0&&<span className="ml-1.5 rounded-full bg-bb-warn/20 px-1.5 text-[11px] text-bb-warn">{needCount}</span>}</Link>)}</nav>
  {tab==='tools'?<DepartmentPage params={{dept:'email'}} embedded/>
  :tab==='previews'?<BrandPanel key={`${p?.slug}:${searchParams.preview}`} initialEmail={searchParams.preview} emailsOnly kit={p?emailDesigns(readBrand(p.slug),snap):null}/>
  :tab==='accounts'?<section className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Accounts</h2><p className="text-[12.5px] text-bb-muted">One row per member the emails concern, by a private reference (never an email or name): where they are, how active they've been, the next email planned and why. Activity is what the business counts (app and web visits, or API requests). Numbers {read}.</p></div><LifecycleRefresh disabled={!connected}/></div>
    {snap?.accounts.length?<div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Account reference','Stage','Activity','Email errors','Next email','Why','Can be emailed'].map(h=><th key={h} className="p-2 whitespace-nowrap border-b border-bb-border">{h}</th>)}</tr></thead><tbody>{snap.accounts.map(a=><tr key={a.id}><td className="p-2 font-mono">{a.id}</td><td className="p-2 whitespace-nowrap">{words(a.stage)}</td><td className="p-2">{a.requests}</td><td className="p-2">{a.errors}</td><td className="p-2">{a.nextEmail||'None planned'}</td><td className="p-2">{words(a.reason)}</td><td className="p-2">{a.suppressed?'No: bounced, complained or unsubscribed':`Yes${a.updates?' · opted in to updates':''}`}</td></tr>)}</tbody></table></div>
      :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">{!p?'Choose a business.':!connected?`${p.name} has no lifecycle connection, so there are no accounts to show.`:`${p.name}'s connection reports totals only, not accounts. That is the safer choice.`}</p>}
  </section>
  :!p?<p className="card px-4 py-3 text-[12.5px] text-bb-muted">Choose a business to see its emails.</p>
  :!connected||!flows.length?<section className="card space-y-2 p-4">
    <h2 className="text-[15px] font-semibold">{!connected?'No email connection yet':'No flows reported yet'}</h2>
    <p className="max-w-[80ch] text-[12.5px] text-bb-muted">{!connected?`HQ can't see ${p.name}'s automated emails yet. Add a private connection in this business's HQ data folder (lifecycle-connection.json); the template adapter is a working starting point.`:'The connection works, but it reports no flows yet.'} <Link href="/guides/lifecycle" className="text-bb-blue hover:underline">How to connect</Link></p>
  </section>
  :<div className="space-y-7">
    <RefreshIfStale stale={Boolean(life?.stale)} connected={connected}/>
    <section aria-labelledby="needs-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="needs-h" className="text-lg font-semibold">{needCount?`Needs you (${needCount})`:'Nothing needs you right now'}</h2>
        <span className="text-[11.5px] text-bb-dim">Numbers {read}{life?.stale?' · refreshing':''}</span>
      </div>
      {needCount?<div className="grid gap-3 xl:grid-cols-2">
        {inbox.drafts.map(d=><DraftCard key={d.key} d={d} notes={notes} observedAt={snap?.observedAt??null} stale={Boolean(life?.stale)} locked={locked} why={why} can={can} tz={tz}/>)}
        {inbox.issues.map(x=><IssueCard key={x.key} x={x} notes={notes} locked={locked} why={why} canMode={canMode}/>)}
        {rivals.map(r=><RivalCard key={r.uuid+r.lastChanged} r={r} notes={notes} tz={tz}/>)}
      </div>
      :<p className="card px-4 py-3 text-[12.5px] text-bb-muted">No drafts waiting and nothing wrong. {upcoming.length?`Next decision: week one of ${upcoming[0].label} ends ${dayLabel(upcoming[0].on)}.`:''}</p>}
    </section>

    <section aria-labelledby="flows-h" className="space-y-2">
      <h2 id="flows-h" className="text-lg font-semibold">Your flows</h2>
      <ul className="card divide-y divide-bb-border/60 px-4 py-1">
        {inbox.flows.map(f=>{const href=flowPage(f.serves);const fnotes=openNotes.filter(x=>x.flow===f.id).length;return <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">{href?<Link href={href} className="text-[13.5px] font-medium hover:text-bb-blue">{f.label}</Link>:<span className="text-[13.5px] font-medium">{f.label}</span>}<span className="text-[11.5px] text-bb-dim">{f.channel}</span></div>
            <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-bb-muted"><span aria-hidden className={`h-2 w-2 rounded-full ${DOT[f.tone]}`}/>{f.headline}<span className="text-bb-dim">· {n(f.sentThisWeek)} sent this week{f.waiting?` · ${n(f.waiting)} waiting for you`:''}{fnotes?` · ${fnotes} open ${fnotes===1?'note':'notes'}`:''}</span></div>
          </div>
          <div className="flex items-center gap-3">{canMode&&<ModeChoice flowId={f.id} label={f.label} mode={f.mode} locked={locked} why={why}/>}{href&&<Link href={href} className="text-[12px] text-bb-blue hover:underline">Details</Link>}</div>
        </li>;})}
      </ul>
      <p className="text-[11.5px] text-bb-dim">Off: nothing is sent · Ask me: each batch waits here for your yes · Auto: goes out on its own. Details shows who qualifies, delivery and whether it made a difference.</p>
    </section>

    {email.length>0&&<p className="text-[12px] text-bb-muted">Email so far: {n(sum('sent'))} sent, {n(sum('delivered'))} delivered, {n(sum('bounced')+sum('complained'))} bounced or marked as spam, {n(sum('unsubscribed'))} unsubscribed. Addresses that bounce, complain or unsubscribe never get another email.</p>}

    {snap?.stages.length?<details className="card px-4 py-2.5"><summary className="cursor-pointer text-[12.5px] text-bb-muted hover:text-bb-fg">Customer stages</summary>
      <table className="mt-2 w-full max-w-[44rem] text-[12.5px]"><tbody>{snap.stages.map(r=><tr key={r.label} className="border-b border-bb-border/60"><td className="py-1.5 pr-3">{words(r.label)}</td><td className="py-1.5 text-right tabular-nums font-semibold">{n(r.count)}</td></tr>)}</tbody></table></details>:null}
  </div>}
 </div>;
}

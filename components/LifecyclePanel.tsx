'use client';
import {useEffect,useState,useRef} from 'react';
import Link from 'next/link';
import {RefreshCw,Pause,Play,Mail,ArrowRight} from 'lucide-react';
import type {LifecycleSnapshot} from '@/lib/lifecycle';
type State={business:string|null;connected:boolean;readOnly?:boolean;snapshot:LifecycleSnapshot|null;stale:boolean};
const words=(s:string)=>s.replaceAll('_',' ');
export function LifecyclePanel({initial,view='overview'}:{initial:State;view?:'overview'|'workflows'|'delivery'|'accounts'}){
  const [data,setData]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const running=useRef(false);
  async function act(action:string){
    if(running.current)return;running.current=true;
    setBusy(true);setError('');
    try{const r=await fetch('/api/lifecycle',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});const v=await r.json();if(!r.ok)throw Error(v.error);setData(v);}
    catch(e){setError(e instanceof Error?e.message:'Connection failed');}finally{setBusy(false);running.current=false;}
  }
  useEffect(()=>{if(!data.connected)return;void act('report');const timer=setInterval(()=>void act('report'),60000);return()=>clearInterval(timer);},[data.business,data.connected]);
  const s=data.snapshot;
  const stale=data.stale||!s?.observedAt||Date.now()-Date.parse(s.observedAt)>300000;
  const workflows=s?.workflows||[{id:'quickstart',label:'First action',delayHours:24,enabled:false,audience:'Opted in; activation not observed'},{id:'help',label:'Offer help',delayHours:72,enabled:false,audience:'Opted in; still inactive'},{id:'updates',label:'Product updates',delayHours:0,enabled:false,audience:'Separate opt-in; approved content'}];
  const bars=(rows:{label:string;count:number}[])=>rows.map(r=><div key={r.label} className="py-2"><div className="flex justify-between gap-3 text-sm"><span className="capitalize">{words(r.label)}</span><span>{r.count}</span></div><div className="mt-1 h-2 bg-bb-border rounded"><div className="h-2 bg-bb-teal rounded" style={{width:`${100*r.count/Math.max(1,...rows.map(x=>x.count))}%`}}/></div></div>);
  return <div className="space-y-6 min-w-0">
    <header className="flex flex-wrap justify-between gap-4"><div><h2 className="text-lg font-semibold">{{overview:"Activity overview",workflows:"Automation controls",delivery:"Delivery status",accounts:"Account activity"}[view]}</h2><p className="text-bb-muted text-sm mt-1">{data.business||'Choose a business'}</p></div><div className="flex gap-2 items-start">
      <button title="Refresh from connected service" aria-label="Refresh lifecycle" disabled={busy||!data.connected} onClick={()=>act('report')} className="p-2 border rounded disabled:opacity-40"><RefreshCw size={18}/></button>
      <button title={data.readOnly?'Read-only connection':s?.paused?'Resume optional emails':'Pause optional emails'} disabled={data.readOnly||busy||!s||stale||!data.connected} onClick={()=>{if(s?.paused&&!confirm('Resume eligible, opted-in email workflows for this business?'))return;void act(s?.paused?'resume':'pause');}} className="flex items-center gap-2 px-3 py-2 border rounded disabled:opacity-40">{s?.paused?<Play size={16}/>:<Pause size={16}/>} {data.readOnly?'Read only':s?.paused?'Resume':'Pause'}</button>
    </div></header>
    <p role="status" className="text-sm text-bb-warn">{error||(!data.connected?'Not connected':!s?'Awaiting first sync':s.collectionFailed?'Source collection failed':stale?'Snapshot stale':s.paused?'Optional emails paused':'Connected')} {s?.observedAt&&` · Observed ${new Date(s.observedAt).toLocaleString()}`}</p>
    {view==='workflows'&&<><section><h2 className="font-semibold mb-3">Workflows</h2><div className="grid gap-3 md:grid-cols-3">{workflows.map(w=><article key={w.id} className="border border-bb-border rounded-md p-4 min-w-0"><div className="flex items-center gap-2"><Mail size={18}/><h3 className="font-medium">{w.label}</h3></div><p className="text-sm text-bb-muted my-3">{w.audience}</p><div className="flex items-center justify-between text-xs gap-2"><span>{w.delayHours?`${w.delayHours} hours`:'Campaign approval'}</span><ArrowRight size={14}/><span>{w.enabled?'Enabled':'Not enabled'}</span></div></article>)}</div></section>
    <nav aria-label="Email previews" className="flex gap-4 flex-wrap text-sm">{[{id:'welcome',label:'Welcome'},...workflows].map(w=><Link key={w.id} className="flex items-center gap-2 underline" href={`/email?tab=previews&preview=${encodeURIComponent(w.id)}#email-previews`}><Mail size={16}/>Preview {w.label.toLowerCase()}</Link>)}</nav></>}
    {(view==='overview'||view==='delivery')&&<div className="grid gap-8 md:grid-cols-2">{view==='overview'&&<section><h2 className="font-semibold mb-2">Activation</h2>{s?bars(s.stages):<p className="text-sm text-bb-muted">No activation data</p>}</section>}<section><h2 className="font-semibold mb-2">Delivery</h2>{s?.delivery.length?bars(s.delivery):<p className="text-sm text-bb-muted">No delivery observations</p>}</section></div>}
    {view==='delivery'&&<section><h2 className="font-semibold mb-3">Send attempts by day</h2><div className="flex items-end gap-2 h-36 border-b border-bb-border overflow-x-auto">{s?.history.length?s.history.map(r=><div key={r.day} className="flex flex-col justify-end items-center h-full min-w-14 text-xs" title={`${r.day}: ${r.count} attempts`}><span>{r.count}</span><div className="bg-bb-pink w-7" style={{height:Math.max(2,100*r.count/Math.max(1,...s.history.map(x=>x.count)))}}/><span className="py-2">{r.day.slice(5)}</span></div>):<p className="text-sm text-bb-muted pb-3">No send history</p>}</div></section>}
    {view==='accounts'&&<section><h2 className="font-semibold mb-3">Accounts</h2><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Account reference','Stage','Requests','Errors','Next email','Decision','Preferences'].map(h=><th key={h} className="p-2 whitespace-nowrap border-b border-bb-border">{h}</th>)}</tr></thead><tbody>{s?.accounts.map(a=><tr key={a.id}><td className="p-2 font-mono">{a.id}</td><td className="p-2 whitespace-nowrap">{words(a.stage)}</td><td className="p-2">{a.requests}</td><td className="p-2">{a.errors}</td><td className="p-2">{a.nextEmail||'None'}</td><td className="p-2">{words(a.reason)}</td><td className="p-2">{a.suppressed?'Suppressed':`Onboarding ${a.onboarding?'on':'off'} · Updates ${a.updates?'on':'off'}`}</td></tr>)}</tbody></table></div>{!s?.accounts.length&&<p className="text-sm text-bb-muted py-3">No account observations</p>}</section>}
  </div>;
}

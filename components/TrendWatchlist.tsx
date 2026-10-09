'use client';
import {useState} from 'react';
import {MAX_WATCHED_ACCOUNTS,accountHandle,type Creator,type Niche,type SocialPlatform,type Video,videoPlatform} from '@/lib/trends';
const number=(n:number)=>Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
export default function TrendWatchlist({niches,creators,videos,busy,onSave}:{niches:Niche[];creators:Creator[];videos:Video[];busy:boolean;onSave:(niches:Niche[])=>Promise<boolean>}) {
 const [draft,setDraft]=useState(niches),[niche,setNiche]=useState(niches[0]?.id??''),[platform,setPlatform]=useState<SocialPlatform>('instagram'),[input,setInput]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
 const dirty=JSON.stringify(draft)!==JSON.stringify(niches);
 function add(){
  setError('');setMessage('');
  try{
   const handle=accountHandle(input,platform),row=draft.find(n=>n.id===niche);
   if(!row)throw Error('Choose a niche first.');
   const handles=row[platform]??[];
   if(handles.some(h=>h.toLowerCase()===handle))throw Error('That account is already watched in this niche.');
   if(handles.length>=MAX_WATCHED_ACCOUNTS)throw Error(`This niche already watches ${MAX_WATCHED_ACCOUNTS} accounts on this platform. Remove one first.`);
   setDraft(draft.map(n=>n.id===niche?{...n,[platform]:[...handles,handle]}:n));setInput('');
  }catch(e){setError(e instanceof Error?e.message:'Could not add account');}
 }
 async function save(){setError('');if(await onSave(draft))setMessage('Watchlist saved. Scan now to collect new accounts; the scheduled collector also picks up changes.');}
 return <section className="space-y-4" aria-label="Watched accounts">
  <div className="card p-5 space-y-4">
   <div className="flex flex-wrap justify-between items-start gap-3"><div><h2 className="font-semibold text-lg">Choose accounts to watch</h2><p className="text-sm text-bb-muted mt-1">Add Instagram or TikTok accounts to a niche. Up to {MAX_WATCHED_ACCOUNTS} per platform per niche.</p></div><button disabled={busy||!dirty} onClick={save} className="rounded-lg px-4 py-2 bg-bb-teal/15 border border-bb-teal/40 text-bb-teal text-sm disabled:opacity-40">Save watchlist{dirty?' •':''}</button></div>
   <form onSubmit={e=>{e.preventDefault();add();}} className="flex flex-wrap items-end gap-3">
    <label className="text-xs text-bb-muted">Niche<select aria-label="Account niche" value={niche} onChange={e=>setNiche(e.target.value)} className="block mt-1 bg-bb-surface2 border border-bb-border rounded-lg p-2.5 text-sm">{draft.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    <label className="text-xs text-bb-muted">Platform<select aria-label="Account platform" value={platform} onChange={e=>setPlatform(e.target.value as SocialPlatform)} className="block mt-1 bg-bb-surface2 border border-bb-border rounded-lg p-2.5 text-sm"><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label>
    <label className="text-xs text-bb-muted flex-1 min-w-48">Handle or profile link<input aria-label="Account handle or profile link" value={input} onChange={e=>setInput(e.target.value)} placeholder="@account or paste profile URL" className="block w-full mt-1 bg-bb-surface2 border border-bb-border rounded-lg p-2.5 text-sm"/></label>
    <button type="submit" disabled={busy||!input.trim()} className="rounded-lg px-4 py-2.5 border border-bb-blue/40 text-bb-blue text-sm disabled:opacity-40">Add account</button>
   </form>
   <p className="text-xs text-bb-dim">You choose the accounts; saving does not follow them on social media. A shared-topic growth signal needs at least 3 creators. A small-account breakout can qualify from one video.</p>
   {error&&<p role="alert" className="text-sm text-bb-danger">{error}</p>}{message&&<p role="status" className="text-sm text-bb-teal">{message}</p>}
  </div>
  {draft.map(n=><section key={n.id} className="card p-5 space-y-3"><h3 className="font-semibold">{n.name}</h3><div className="grid lg:grid-cols-2 gap-5">{(['instagram','tiktok'] as const).map(p=><div key={p} className="space-y-2"><p className="text-xs text-bb-muted capitalize">{p} · {(n[p]??[]).length}/{MAX_WATCHED_ACCOUNTS}</p>{(n[p]??[]).length?(n[p]??[]).map(h=>{
   const c=creators.find(c=>c.platform===p&&c.handle.toLowerCase()===h.toLowerCase()),count=videos.filter(v=>videoPlatform(v)===p&&v.channel.toLowerCase()===h.toLowerCase()&&v.nicheIds.includes(n.id)).length;
   return <div key={h} className="rounded-lg border border-bb-border p-3 flex justify-between gap-2"><div className="min-w-0"><a href={p==='instagram'?`https://www.instagram.com/${h}/`:`https://www.tiktok.com/@${h}`} target="_blank" rel="noreferrer" className="text-sm text-bb-blue break-all">@{h} ↗</a><p className="text-xs text-bb-muted mt-1">{c?.followers!=null?`${number(c.followers)} followers`:'Followers unknown'} · {count} saved posts</p><p className="text-[10px] text-bb-dim mt-1">{c?.error?`${c.error}${c.followers!=null?' · previous count retained':''}`:c?.observedAt?`Audience checked ${new Date(c.observedAt).toLocaleString('en-AU')}`:'Awaiting profile scan'}</p></div><button aria-label={`Remove ${p} ${h} from ${n.name}`} onClick={()=>{setDraft(draft.map(row=>row.id===n.id?{...row,[p]:(row[p]??[]).filter(v=>v!==h)}:row));setMessage('');}} className="text-xs text-bb-muted hover:text-bb-danger self-start">Remove</button></div>;
  }):<p className="text-xs text-bb-dim border border-dashed border-bb-border rounded-lg p-4">No accounts selected. Add an account above to watch this niche.</p>}</div>)}</div></section>)}
 </section>;
}

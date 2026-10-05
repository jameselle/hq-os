'use client';
import {useState} from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {Download,Monitor,Smartphone,Mail} from 'lucide-react';
import type {BrandKit} from '@/lib/brand';

export function BrandPanel({kit,emailsOnly=false,initialEmail}:{kit:BrandKit|null;emailsOnly?:boolean;initialEmail?:string}){
  const [selected,setSelected]=useState(kit?.emails.some(e=>e.id===initialEmail)?initialEmail!:kit?.emails[0]?.id||'');
  const [mobile,setMobile]=useState(false);
  const [plain,setPlain]=useState(false);
  if(!kit)return <section className="py-5 border-y border-bb-border"><h2 className="font-semibold">Brand identity & email previews</h2><p className="text-sm text-bb-muted mt-2">No brand kit connected for this business.</p></section>;
  const email=kit.emails.find(e=>e.id===selected);
  return <section id="email-previews" className="space-y-6 min-w-0 scroll-mt-20" aria-label="Brand identity and email previews">
    {!emailsOnly&&<><header><h2 className="text-xl font-semibold">Brand identity</h2><p className="text-sm text-bb-muted">{kit.status} · {kit.updatedAt.slice(0,10)}</p></header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kit.colors.map(c=><div key={c.hex}><div className="h-12 border border-bb-border rounded" style={{background:c.hex}}/><p className="text-sm mt-2">{c.name} <code>{c.hex}</code></p><p className="text-xs text-bb-muted">{c.use}</p></div>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kit.assets.filter(a=>a.file.endsWith('.png')).map(a=><figure key={a.file} className="min-w-0"><img src={'/api/brand-assets?preview=1&file='+encodeURIComponent(a.file)} alt={a.label} className="w-full h-52 object-contain bg-white border border-bb-border rounded"/><figcaption className="text-xs text-bb-muted mt-2">{a.label}</figcaption></figure>)}</div>
      <div className="prose-brief text-sm max-w-4xl"><ReactMarkdown>{kit.guide}</ReactMarkdown></div>
      <div className="flex flex-wrap gap-4">{kit.assets.map(a=><a key={a.file} className="flex items-center gap-2 text-sm underline" href={'/api/brand-assets?file='+encodeURIComponent(a.file)} download={a.file}><Download size={16}/>{a.label}</a>)}</div></>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold flex items-center gap-2"><Mail size={18}/>Email previews</h2>{emailsOnly&&<Link className="text-sm underline" href="/design">Design & Brand</Link>}</div>
    {emailsOnly&&<div className="flex flex-wrap gap-4">{kit.assets.filter(a=>a.file.endsWith('.html')).map(a=><a key={a.file} className="inline-flex items-center gap-2 text-sm underline" href={'/api/brand-assets?file='+encodeURIComponent(a.file)} download={a.file}><Download size={16}/>{a.label}</a>)}</div>}
    <div className="flex flex-wrap gap-3 items-center"><label className="text-sm">Email <select className="ml-2 bg-bb-surface border border-bb-border rounded p-2 max-w-full" value={selected} onChange={e=>setSelected(e.target.value)}>{[...new Set(kit.emails.map(e=>e.id.startsWith('flow-')?'Sent by your flows':'Brand kit designs'))].map(g=><optgroup key={g} label={g}>{kit.emails.filter(e=>(e.id.startsWith('flow-')?'Sent by your flows':'Brand kit designs')===g).map(e=><option key={e.id} value={e.id}>{e.label.replace(/^Brand kit: /,'')}</option>)}</optgroup>)}</select></label>
      <div className="flex border border-bb-border rounded" role="group" aria-label="Preview size">{[false,true].map(m=><button key={String(m)} title={m?'Mobile preview':'Desktop preview'} aria-label={m?'Mobile preview':'Desktop preview'} aria-pressed={mobile===m} onClick={()=>setMobile(m)} className={`p-2 ${mobile===m?'bg-bb-border':''}`}>{m?<Smartphone size={18}/>:<Monitor size={18}/>}</button>)}</div>
      {email?.html&&<label className="text-sm"><input type="checkbox" checked={plain} onChange={e=>setPlain(e.target.checked)}/> Plain text</label>}</div>
    {email&&<><dl className="text-sm space-y-2 break-words"><div><dt className="inline text-bb-muted">Subject: </dt><dd className="inline">{email.subject}</dd></div><div><dt className="inline text-bb-muted">From: </dt><dd className="inline">{email.sender}</dd></div><div><dt className="inline text-bb-muted">Trigger: </dt><dd className="inline">{email.trigger}</dd></div><div><dt className="inline text-bb-muted">Status: </dt><dd className="inline">{email.status}</dd></div><div><dt className="inline text-bb-muted">Source: </dt><dd className="inline">{email.source}</dd></div></dl>
      <div className="mx-auto border border-bb-border bg-white text-black" style={{width:mobile?375:680,maxWidth:'100%'}}>{email.html&&!plain?<iframe title={`${email.label} preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'">${email.html}`} className="w-full h-[620px] border-0"/>:<pre className="p-5 whitespace-pre-wrap break-words text-sm font-sans leading-7 min-h-72">{email.text}</pre>}</div>
      <p className="text-xs text-bb-muted">{email.id.startsWith('flow-')?'The exact email the flow sends, as its engine renders it. ':''}Preview only. No messages are sent. Personal links use synthetic values; previews cannot submit forms or load remote content.</p></>}
  </section>;
}

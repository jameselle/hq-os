// Business-specific commands and snapshots live exclusively in private HQ_DATA.
import fs from 'node:fs';
import path from 'node:path';
import {businessDir, getProfile} from './store';
import {execAdapter, readConnection, writePrivateJson} from './private-adapter';

/** One automated message. The optional fields are the proof HQ's Workflows tab reads:
 *  serves = the workflow title in lib/workflows.ts it delivers for; sent30d/lastSentAt = real
 *  deliveries (owner tests excluded); drafts = messages waiting for the owner's yes, with a preview. */
export type LifecycleWorkflow = {
  id:string; label:string; delayHours:number; enabled:boolean; audience:string;
  serves?:string; sent30d?:number; lastSentAt?:string|null; drafts?:number;
  /** When the oldest waiting draft expires unsent (ISO). Null or absent: drafts don't expire or none wait. */
  expiresAt?:string|null;
  preview?:{subject:string; text:string};
};
/** One automated flow, as the lifecycle centre shows it: who enters, what went out, what happened after.
 *  Counts and rates only; no names, emails or ids. `messages` carry the real rendered email (shown sandboxed). */
export type FlowCount = { label: string; count: number };
export type FlowOutcome = { label: string; window: string; emailed: { n: number; hit: number }; holdout?: { n: number; hit: number } | null };
export type LifecycleFlow = {
  id: string; label: string; serves?: string; mode?: 'off'|'draft'|'auto'; holdoutPct?: number;
  channel: 'email'|'discord'|'sms'|'push';
  /** Who enters, in plain words. */
  trigger: string;
  daily: { day: string; entered: number; sent: number; skipped: number }[];
  delivery: FlowCount[];
  skips: FlowCount[];
  outcomes: FlowOutcome[];
  messages: { id: string; label: string; subject: string; html: string }[];
  /** The day (YYYY-MM-DD, the business's time zone) the delivery, skip and outcome counts start from. */
  since?: string;
  /** Replies the adapter can see (an inbox it reads). Absent: HQ can't see replies, and says so. */
  replies?: number | null;
};
export type LifecycleAction = 'report'|'pause'|'resume'|'approve'|'test'|'mode';
export type LifecycleSnapshot = {
  version:number; observedAt:string|null; paused:boolean; collectionFailed:boolean;
  stages:{label:string;count:number}[]; delivery:{label:string;count:number}[];
  history:{day:string;count:number}[];
  workflows:LifecycleWorkflow[];
  accounts:{id:string;stage:string;phoneVerified:boolean;requests:number;errors:number;nextEmail:string|null;reason:string;onboarding:boolean;updates:boolean;suppressed:boolean}[];
  /** Optional: the lifecycle centre's per-flow analytics. */
  flows?:LifecycleFlow[];
  /** The write actions this adapter accepts. Absent means all of them (older adapters); HQ hides the rest. */
  supports?:WriteAction[];
};
export const WRITE_ACTIONS=['pause','resume','approve','test','mode'] as const;
export type WriteAction=typeof WRITE_ACTIONS[number];
/** Whether the adapter behind this snapshot accepts a write action. */
export const supports=(snapshot:Pick<LifecycleSnapshot,'supports'>|null|undefined,action:WriteAction)=>!snapshot?.supports||snapshot.supports.includes(action);
const str=(s:unknown)=>typeof s==='string'&&s.length<=300;
const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
export function localLifecycleOrigin(origin:string|null,host:string|null){
  try{const url=new URL(origin||'');return ['http:','https:'].includes(url.protocol)&&['127.0.0.1','localhost'].includes(url.hostname)&&url.host===host;}catch{return false;}
}
/** A request addressed to this Mac by name (Host header), so a rebinding page can't read local data. */
export function localHost(host:string|null){
  try{return Boolean(host)&&['127.0.0.1','localhost'].includes(new URL('http://'+host).hostname);}catch{return false;}
}
const iso=(s:unknown)=>str(s)&&Number.isFinite(Date.parse(s as string));
function validWorkflow(r:LifecycleWorkflow){
  return str(r.id)&&str(r.label)&&str(r.audience)&&count(r.delayHours)&&typeof r.enabled==='boolean'
    &&(r.serves===undefined||str(r.serves))&&(r.sent30d===undefined||count(r.sent30d))&&(r.drafts===undefined||count(r.drafts))
    &&(r.lastSentAt===undefined||r.lastSentAt===null||iso(r.lastSentAt))
    &&(r.expiresAt===undefined||r.expiresAt===null||iso(r.expiresAt))
    &&(r.preview===undefined||(str(r.preview?.subject)&&typeof r.preview?.text==='string'&&r.preview.text.length<=4000));
}
const MODES=['off','draft','auto'], CHANNELS=['email','discord','sms','push'];
const counts=(xs:unknown,max:number)=>Array.isArray(xs)&&xs.length<=max&&xs.every((r:any)=>str(r?.label)&&count(r?.count));
const pair=(p:any)=>p&&count(p.n)&&count(p.hit)&&p.hit<=p.n;
export function validFlow(f:LifecycleFlow){
  return Boolean(f&&str(f.id)&&str(f.label)&&(f.serves===undefined||str(f.serves))&&(f.mode===undefined||MODES.includes(f.mode))
    &&(f.holdoutPct===undefined||(count(f.holdoutPct)&&f.holdoutPct<=90))&&CHANNELS.includes(f.channel)&&str(f.trigger)
    &&Array.isArray(f.daily)&&f.daily.length<=120&&f.daily.every((d)=>/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&count(d.entered)&&count(d.sent)&&count(d.skipped))
    &&counts(f.delivery,20)&&counts(f.skips,20)
    &&Array.isArray(f.outcomes)&&f.outcomes.length<=16&&f.outcomes.every((o)=>str(o.label)&&str(o.window)&&pair(o.emailed)&&(o.holdout===undefined||o.holdout===null||pair(o.holdout)))
    &&Array.isArray(f.messages)&&f.messages.length<=8&&f.messages.every((m)=>str(m.id)&&str(m.label)&&str(m.subject)&&typeof m.html==='string'&&m.html.length<=80000)
    &&(f.since===undefined||/^\d{4}-\d{2}-\d{2}$/.test(f.since))&&(f.replies===undefined||f.replies===null||count(f.replies)));
}
export function validLifecycle(v:unknown):v is LifecycleSnapshot {
  const x=v as LifecycleSnapshot;
  return Boolean(x&&x.version===1&&(x.observedAt===null||(str(x.observedAt)&&Number.isFinite(Date.parse(x.observedAt))))&&typeof x.paused==='boolean'&&typeof x.collectionFailed==='boolean'
    &&['stages','delivery'].every(k=>Array.isArray((x as any)[k])&&(x as any)[k].length<=100&&(x as any)[k].every((r:any)=>str(r.label)&&count(r.count)))
    &&Array.isArray(x.history)&&x.history.length<=90&&x.history.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&count(r.count))
    &&Array.isArray(x.workflows)&&x.workflows.length<=30&&x.workflows.every(validWorkflow)
    &&Array.isArray(x.accounts)&&x.accounts.length<=10000&&(x.flows===undefined||(Array.isArray(x.flows)&&x.flows.length<=20&&x.flows.every(validFlow)))&&(x.supports===undefined||(Array.isArray(x.supports)&&x.supports.every(a=>(WRITE_ACTIONS as readonly string[]).includes(a))))&&x.accounts.every(r=>str(r.id)&&str(r.stage)&&str(r.reason)&&(r.nextEmail===null||str(r.nextEmail))&&count(r.requests)&&count(r.errors)&&['phoneVerified','onboarding','updates','suppressed'].every(k=>typeof (r as any)[k]==='boolean')));
}
export function lifecycleState(slug:string) {
  if(!getProfile(slug))throw Error('Unknown business');
  const dir=businessDir(slug);
  const connected=fs.existsSync(path.join(dir,'lifecycle-connection.json'));
  let readOnly=true;
  try{readOnly=JSON.parse(fs.readFileSync(path.join(dir,'lifecycle-connection.json'),'utf8')).readOnly===true;}catch{}
  let snapshot:LifecycleSnapshot|null=null;
  try{const raw=JSON.parse(fs.readFileSync(path.join(dir,'lifecycle-snapshot.json'),'utf8'));if(validLifecycle(raw))snapshot=raw;}catch{}
  const age=snapshot?.observedAt?Date.now()-Date.parse(snapshot.observedAt):Infinity;
  return {connected,readOnly,snapshot,stale:age<0||age>5*60000};
}
/** Approving needs the workflow and the snapshot time the owner looked at, so drafts planned since then wait for the next look. */
export type LifecycleRequest = {action:LifecycleAction; workflow?:string; before?:string; mode?:string};
export async function runLifecycle(slug:string,action:LifecycleAction,opts:{workflow?:string;before?:string;mode?:string}={}) {
  const config=readConnection(slug,'lifecycle-connection.json');
  if(config.readOnly===true&&action!=='report')throw Error('Read-only lifecycle connection');
  if(action!=='report'&&!supports(lifecycleState(slug).snapshot,action))throw Error(`This business's lifecycle adapter does not support ${action}`);
  const input:LifecycleRequest={action};
  if(action==='mode'){
    if(!opts.workflow||!str(opts.workflow))throw Error('Choose a flow');
    if(!MODES.includes(opts.mode??''))throw Error('Mode must be off, draft or auto');
    input.workflow=opts.workflow;input.mode=opts.mode;
  }
  if(action==='approve'||action==='test'){
    if(!opts.workflow||!str(opts.workflow))throw Error('Choose a workflow');
    input.workflow=opts.workflow;
  }
  if(action==='approve'){
    if(!iso(opts.before))throw Error('Approve what you saw: snapshot time missing');
    input.before=opts.before;
  }
  const value=await execAdapter(config.command,input);
  if(!validLifecycle(value))throw Error('Invalid lifecycle snapshot');
  // Reconstruct allowed fields rather than persisting arbitrary adapter output.
  const clean:LifecycleSnapshot={version:1,observedAt:value.observedAt,paused:value.paused,collectionFailed:value.collectionFailed,
    stages:value.stages.map(({label,count})=>({label,count})),delivery:value.delivery.map(({label,count})=>({label,count})),history:value.history.map(({day,count})=>({day,count})),
    workflows:value.workflows.map(cleanWorkflow),
    ...(value.flows?{flows:value.flows.map(cleanFlow)}:{}),
    ...(value.supports?{supports:[...new Set(value.supports)]}:{}),
    accounts:value.accounts.map(({id,stage,phoneVerified,requests,errors,nextEmail,reason,onboarding,updates,suppressed})=>({id,stage,phoneVerified,requests,errors,nextEmail,reason,onboarding,updates,suppressed}))};
  writePrivateJson(path.join(businessDir(slug),'lifecycle-snapshot.json'),clean);
  return lifecycleState(slug);
}
function cleanFlow(f:LifecycleFlow):LifecycleFlow{
  return {id:f.id,label:f.label,...(f.serves!==undefined?{serves:f.serves}:{}),...(f.mode?{mode:f.mode}:{}),...(f.holdoutPct!==undefined?{holdoutPct:f.holdoutPct}:{}),
    channel:f.channel,trigger:f.trigger,
    daily:f.daily.map(({day,entered,sent,skipped})=>({day,entered,sent,skipped})),
    delivery:f.delivery.map(({label,count})=>({label,count})),skips:f.skips.map(({label,count})=>({label,count})),
    outcomes:f.outcomes.map(({label,window,emailed,holdout})=>({label,window,emailed:{n:emailed.n,hit:emailed.hit},...(holdout?{holdout:{n:holdout.n,hit:holdout.hit}}:{})})),
    messages:f.messages.map(({id,label,subject,html})=>({id,label,subject,html})),
    ...(f.since!==undefined?{since:f.since}:{}),...(f.replies!==undefined?{replies:f.replies}:{})};
}
function cleanWorkflow(w:LifecycleWorkflow):LifecycleWorkflow{
  const out:LifecycleWorkflow={id:w.id,label:w.label,delayHours:w.delayHours,enabled:w.enabled,audience:w.audience};
  if(w.serves!==undefined)out.serves=w.serves;
  if(w.sent30d!==undefined)out.sent30d=w.sent30d;
  if(w.lastSentAt!==undefined)out.lastSentAt=w.lastSentAt;
  if(w.drafts!==undefined)out.drafts=w.drafts;
  if(w.expiresAt!==undefined)out.expiresAt=w.expiresAt;
  if(w.preview)out.preview={subject:w.preview.subject,text:w.preview.text};
  return out;
}

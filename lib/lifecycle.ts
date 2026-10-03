// Business-specific commands and snapshots live exclusively in private HQ_DATA.
import fs from 'node:fs';
import path from 'node:path';
import {businessDir, getProfile} from './store';
import {execAdapter, readConnection, writePrivateJson} from './private-adapter';

export type LifecycleSnapshot = {
  version:number; observedAt:string|null; paused:boolean; collectionFailed:boolean;
  stages:{label:string;count:number}[]; delivery:{label:string;count:number}[];
  history:{day:string;count:number}[];
  workflows:{id:string;label:string;delayHours:number;enabled:boolean;audience:string}[];
  accounts:{id:string;stage:string;phoneVerified:boolean;requests:number;errors:number;nextEmail:string|null;reason:string;onboarding:boolean;updates:boolean;suppressed:boolean}[];
};
const str=(s:unknown)=>typeof s==='string'&&s.length<=300;
const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
export function localLifecycleOrigin(origin:string|null,host:string|null){
  try{const url=new URL(origin||'');return ['http:','https:'].includes(url.protocol)&&['127.0.0.1','localhost'].includes(url.hostname)&&url.host===host;}catch{return false;}
}
/** A request addressed to this Mac by name (Host header), so a rebinding page can't read local data. */
export function localHost(host:string|null){
  try{return Boolean(host)&&['127.0.0.1','localhost'].includes(new URL('http://'+host).hostname);}catch{return false;}
}
export function validLifecycle(v:unknown):v is LifecycleSnapshot {
  const x=v as LifecycleSnapshot;
  return Boolean(x&&x.version===1&&(x.observedAt===null||(str(x.observedAt)&&Number.isFinite(Date.parse(x.observedAt))))&&typeof x.paused==='boolean'&&typeof x.collectionFailed==='boolean'
    &&['stages','delivery'].every(k=>Array.isArray((x as any)[k])&&(x as any)[k].length<=100&&(x as any)[k].every((r:any)=>str(r.label)&&count(r.count)))
    &&Array.isArray(x.history)&&x.history.length<=90&&x.history.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&count(r.count))
    &&Array.isArray(x.workflows)&&x.workflows.length<=30&&x.workflows.every(r=>str(r.id)&&str(r.label)&&str(r.audience)&&count(r.delayHours)&&typeof r.enabled==='boolean')
    &&Array.isArray(x.accounts)&&x.accounts.length<=10000&&x.accounts.every(r=>str(r.id)&&str(r.stage)&&str(r.reason)&&(r.nextEmail===null||str(r.nextEmail))&&count(r.requests)&&count(r.errors)&&['phoneVerified','onboarding','updates','suppressed'].every(k=>typeof (r as any)[k]==='boolean')));
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
export async function runLifecycle(slug:string,action:'report'|'pause'|'resume') {
  const config=readConnection(slug,'lifecycle-connection.json');
  if(config.readOnly===true&&action!=='report')throw Error('Read-only lifecycle connection');
  const value=await execAdapter(config.command,{action});
  if(!validLifecycle(value))throw Error('Invalid lifecycle snapshot');
  // Reconstruct allowed fields rather than persisting arbitrary adapter output.
  const clean:LifecycleSnapshot={version:1,observedAt:value.observedAt,paused:value.paused,collectionFailed:value.collectionFailed,
    stages:value.stages.map(({label,count})=>({label,count})),delivery:value.delivery.map(({label,count})=>({label,count})),history:value.history.map(({day,count})=>({day,count})),
    workflows:value.workflows.map(({id,label,delayHours,enabled,audience})=>({id,label,delayHours,enabled,audience})),
    accounts:value.accounts.map(({id,stage,phoneVerified,requests,errors,nextEmail,reason,onboarding,updates,suppressed})=>({id,stage,phoneVerified,requests,errors,nextEmail,reason,onboarding,updates,suppressed}))};
  writePrivateJson(path.join(businessDir(slug),'lifecycle-snapshot.json'),clean);
  return lifecycleState(slug);
}

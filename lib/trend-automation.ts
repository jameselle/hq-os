import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {getProfile,listBusinesses} from './store';
import {writePrivateJson} from './private-adapter';
import {accountHandle,MAX_WATCHED_ACCOUNTS,type SocialPlatform} from './trends';
import {readNiches,trendDir} from './trend-store';
import {readDiscoveries,startDiscovery,research,watchDiscovered} from './trend-discovery';
export type DiscoverySchedule={id:string;enabled:boolean;seed:string;platform:SocialPlatform;nicheId:string;focus:string;hours:24|168;autoWatch:boolean;lastAttempt?:string;lastRun?:string;error?:string};
const file=(slug:string)=>path.join(trendDir(slug),'discovery-schedules.json');
export function readSchedules(slug:string):DiscoverySchedule[]{return fs.existsSync(file(slug))?JSON.parse(fs.readFileSync(file(slug),'utf8')):[];}
export function discoveryDefaults(slug:string){const p=getProfile(slug)!;return {focus:`${p.offer}. Audience: ${p.audience}. Country: ${p.country}.`.slice(0,300),seeds:Object.fromEntries(['instagram','tiktok'].map(platform=>{const c=p.channels[platform];return [platform,typeof c==='string'?c:c?.handle??''];}))};}
export function saveSchedule(slug:string,raw:unknown){
 const v=raw as Record<string,unknown>;if(!v||!['instagram','tiktok'].includes(String(v.platform))||typeof v.seed!=='string'||typeof v.nicheId!=='string'||typeof v.enabled!=='boolean'||typeof v.autoWatch!=='boolean'||![24,168].includes(Number(v.hours))||typeof v.focus!=='string'||v.focus.length>300)throw Error('Choose a seed, niche, cadence and watch mode.');
 if(!readNiches(slug).some(n=>n.id===v.nicheId))throw Error('Choose a saved niche.');
 const platform=v.platform as SocialPlatform,seed=accountHandle(v.seed,platform),rows=readSchedules(slug),old=rows.find(r=>r.platform===platform&&r.nicheId===v.nicheId);
 const row:DiscoverySchedule={id:old?.id??randomUUID(),enabled:v.enabled,autoWatch:v.autoWatch,platform,seed,nicheId:v.nicheId,focus:v.focus,hours:Number(v.hours) as 24|168};
 if(old&&old.seed===seed&&old.focus===v.focus){row.lastAttempt=old.lastAttempt;row.lastRun=old.lastRun;row.error=old.error;}
 writePrivateJson(file(slug),[...rows.filter(r=>r.id!==row.id),row]);return readSchedules(slug);
}
export function toggleSchedule(slug:string,id:string,enabled:boolean){const rows=readSchedules(slug);const row=rows.find(r=>r.id===id);if(!row||typeof enabled!=='boolean')throw Error('Unknown schedule');row.enabled=enabled;writePrivateJson(file(slug),rows);}
export async function tickDiscovery(slug:string,runner=research,now=Date.now()){
 const due=readSchedules(slug).filter(r=>r.enabled&&(!r.lastAttempt||now-Date.parse(r.lastAttempt)>=r.hours*3600000)).sort((a,b)=>(a.lastAttempt??'').localeCompare(b.lastAttempt??''));
 if(!due.length||readDiscoveries(slug).some(r=>r.status==='running'))return;
 const lock=path.join(trendDir(slug),'discovery-tick.lock');if(fs.existsSync(lock)&&now-fs.statSync(lock).mtimeMs>10*60_000)fs.unlinkSync(lock);
 let fd:number;try{fd=fs.openSync(lock,'wx',0o600);}catch{return;}
 const rule=due[0];
 function update(patch:Partial<DiscoverySchedule>){const rows=readSchedules(slug);const current=rows.find(r=>r.id===rule.id);if(current){Object.assign(current,patch);writePrivateJson(file(slug),rows);}}
 try{
  update({lastAttempt:new Date(now).toISOString(),error:undefined});
  let done!:()=>void;const finished=new Promise<void>(resolve=>done=resolve);
  const run=startDiscovery(slug,rule,async(r,cwd)=>{try{return await runner(r,cwd);}finally{setImmediate(done);}});
  update({lastRun:run.id});await finished;
  const result=readDiscoveries(slug).find(r=>r.id===run.id);if(result?.status!=='complete')throw Error(result?.error??'Research interrupted');
  const current=readSchedules(slug).find(r=>r.id===rule.id);
  if(current?.enabled&&current.autoWatch&&current.seed===rule.seed&&current.focus===rule.focus){
   const niche=readNiches(slug).find(n=>n.id===rule.nicheId);if(!niche)throw Error('Destination niche removed');
   const room=MAX_WATCHED_ACCOUNTS-(niche[rule.platform]?.length??0);
   const handles=result.candidates.filter(c=>c.profileChecked&&c.officialSource&&/^Direct competitor\b/i.test(c.reason)&&!(niche[rule.platform]??[]).includes(c.handle)).slice(0,Math.max(0,room)).map(c=>c.handle);
   if(handles.length)watchDiscovered(slug,run.id,handles);
  }
 }catch(e){update({error:e instanceof Error?e.message:'Automatic discovery failed'});}finally{fs.closeSync(fd!);fs.unlinkSync(lock);}
}
export async function discoverDue(){
 // One due business per tick keeps public-post scans responsive across businesses.
 const due=listBusinesses().profiles.flatMap(p=>readSchedules(p.slug).filter(r=>r.enabled&&(!r.lastAttempt||Date.now()-Date.parse(r.lastAttempt)>=r.hours*3600000)).map(r=>({slug:p.slug,last:r.lastAttempt??''}))).sort((a,b)=>a.last.localeCompare(b.last));
 for(const item of due){if(readDiscoveries(item.slug).some(r=>r.status==='running'))continue;await tickDiscovery(item.slug);break;}
}

import fs from 'node:fs';
import path from 'node:path';
import {businessDir,getProfile,listBusinesses} from './store';
import {writePrivateJson} from './private-adapter';
import {matchesNiche,addReading,DEFAULT_NICHES,HOUR,INTERVAL,trendBoard,validateNiches,PLATFORMS,videoPlatform,type Platform,type SourceHealth,type VideoRef,type Niche,type State,type Video} from './trends';
import {discover,observe} from './trend-source';
import {discoverCreator,observeSocial,observeCreator} from './trend-social-source';
export const trendDir=(slug:string)=>{
  if(!/^[a-z0-9-]+$/.test(slug)||!getProfile(slug))throw Error('Unknown business');
  return path.join(businessDir(slug),'trends');
};
export function readNiches(slug:string):Niche[] {
  const file=path.join(trendDir(slug),'niches.json');
  return fs.existsSync(file)?validateNiches(JSON.parse(fs.readFileSync(file,'utf8'))):DEFAULT_NICHES;
}
export function saveNiches(slug:string,value:unknown) {
  const niches=validateNiches(value),dir=trendDir(slug);fs.mkdirSync(dir,{recursive:true});
  writePrivateJson(path.join(dir,'niches.json'),niches);return niches;
}
export function readTrends(slug:string):State {
  const file=path.join(trendDir(slug),'state.json');
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{videos:[],runs:[],lastDiscovery:null,history:[]};
}
export function radar(slug:string) {
  const niches=readNiches(slug),state=readTrends(slug),now=Date.now();
  const active=state.videos.map(v=>({...v,nicheIds:niches.filter(n=>matchesNiche(v,n)).map(n=>n.id)})).filter(v=>v.nicheIds.length>0);
  const sources=PLATFORMS.map(platform=>{const configured=platform==='youtube'||niches.some(n=>(n[platform]??[]).length>0);const lastRun=state.runs.findLast(r=>r.sources?.[platform]);const health=lastRun?.sources?.[platform];const lastObserved=active.filter(v=>videoPlatform(v)===platform).flatMap(v=>v.readings.map(r=>r.at)).sort().at(-1)??null;return {platform,configured,lastObserved,observed:health?.observed??0,failed:health?.failed??0,errors:health?.errors??[],posts:active.filter(v=>videoPlatform(v)===platform).length,status:!configured?'not configured':health?.errors.length||health?.failed?'partial':lastObserved&&now-Date.parse(lastObserved)<30*60_000?'live':'awaiting scan'};});
  return {sources,niches,creators:(state.creators??[]).filter(c=>niches.some(n=>(n[c.platform]??[]).some(h=>h.toLowerCase()===c.handle.toLowerCase()))),trends:trendBoard(state,niches,now),videos:active,runs:state.runs.slice(-12).reverse(),intervalMinutes:15,generatedAt:new Date(now).toISOString()};
}
async function pool<T,R>(items:T[],count:number,fn:(item:T)=>Promise<R>):Promise<PromiseSettledResult<R>[]> {
  const results:PromiseSettledResult<R>[] = new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(count,items.length)},async()=>{
    while(next<items.length){const i=next++;try{results[i]={status:'fulfilled',value:await fn(items[i])};}catch(reason){results[i]={status:'rejected',reason};}}
  }));return results;
}
type Sources={discover:typeof discover;observe:typeof observe;discoverCreator?:typeof discoverCreator;observeSocial?:typeof observeSocial;observeCreator?:typeof observeCreator};
export async function collectTrends(slug:string,options:{force?:boolean}={},source:Sources={discover,observe,discoverCreator,observeSocial,observeCreator}) {
  const dir=trendDir(slug);fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,'scan.lock');
  // A killed process may leave a lock. Collection is bounded well below ten minutes.
  if(fs.existsSync(lock)&&Date.now()-fs.statSync(lock).mtimeMs>10*60_000)fs.unlinkSync(lock);
  let fd:number;try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('A scan is already running.');}
  try {
    const state=readTrends(slug),niches=readNiches(slug),now=Date.now(),at=new Date(now).toISOString();
    const configFile=path.join(dir,'niches.json');
    const configChanged=!state.lastDiscovery||(fs.existsSync(configFile)&&fs.statSync(configFile).mtimeMs>Date.parse(state.lastDiscovery));
    if(!configChanged && !options.force && state.runs.at(-1) && now-Date.parse(state.runs.at(-1)!.at)<INTERVAL*.9)return {skipped:true};
    const lastSuccess=state.runs.findLast(r=>r.observed>0);
    if(!configChanged && options.force && lastSuccess && now-Date.parse(lastSuccess.finishedAt)<60_000)return {skipped:true};
    const errors:string[]=[],found=new Map<string,Set<string>>(),refs=new Map<string,VideoRef>();
    const health:Record<Platform,SourceHealth>={youtube:{discovered:0,observed:0,failed:0,errors:[]},instagram:{discovered:0,observed:0,failed:0,errors:[]},tiktok:{discovered:0,observed:0,failed:0,errors:[]}};
    const deadline=now+8*60_000;
    const budget=()=>{if(Date.now()>deadline)throw Error('Scan time budget reached');};
    let discovered=0;
    const needsDiscovery=configChanged || !state.lastDiscovery || now-Date.parse(state.lastDiscovery)>=INTERVAL*.9 || options.force;
    if(needsDiscovery) {
      const results=await pool(niches,3,n=>{budget();return source.discover(n.query);});
      results.forEach((r,i)=>{
        if(r.status==='rejected'){health.youtube.errors.push(`${niches[i].name}: discovery unavailable`);return;}
        if(!r.value.length)health.youtube.errors.push(`${niches[i].name}: no recent results`);
        for(const id of r.value){refs.set(id,{id,platform:'youtube'});const ids=found.get(id)??new Set<string>();ids.add(niches[i].id);found.set(id,ids);}
      });
      health.youtube.discovered=found.size;
      const jobs=new Map<string,{platform:'instagram'|'tiktok';handle:string;nicheIds:Set<string>}>();
      for(const niche of niches)for(const platform of ['instagram','tiktok'] as const)for(const handle of niche[platform]??[]){const key=`${platform}:${handle.toLowerCase()}`;const job=jobs.get(key)??{platform,handle,nicheIds:new Set<string>()};job.nicheIds.add(niche.id);jobs.set(key,job);}
      const entries=[...jobs.values()];
      if(source.observeCreator) {
        const profiles=await pool(entries,4,job=>{budget();return source.observeCreator!(job.platform,job.handle);});
        const saved=new Map((state.creators??[]).map(c=>[`${c.platform}:${c.handle.toLowerCase()}`,c]));
        profiles.forEach((r,i)=>{const {platform,handle}=entries[i],key=`${platform}:${handle.toLowerCase()}`;
          if(r.status==='fulfilled'&&r.value.platform===platform&&r.value.handle.toLowerCase()===handle.toLowerCase())saved.set(key,r.value);
          else saved.set(key,{...(saved.get(key)??{platform,handle,followers:null,observedAt:null}),checkedAt:new Date().toISOString(),error:'Public follower count unavailable'});
        });
        state.creators=[...saved.values()];
      }
      const social=await pool(entries,3,job=>{budget();if(!source.discoverCreator)throw Error('Social collector unavailable');return source.discoverCreator(job.platform,job.handle);});
      social.forEach((r,i)=>{const job=entries[i];if(r.status==='rejected'){health[job.platform].errors.push(`@${job.handle}: public profile unavailable`);return;}health[job.platform].discovered+=r.value.length;for(const ref of r.value){refs.set(ref.id,ref);const ids=found.get(ref.id)??new Set<string>();for(const id of job.nicheIds)ids.add(id);found.set(ref.id,ids);}});
      state.lastDiscovery=at;
      state.discoveryErrors=Object.fromEntries(PLATFORMS.map(p=>[p,[...health[p].errors]]));
      discovered=found.size;
    }else{for(const p of PLATFORMS)health[p].errors=[...(state.discoveryErrors?.[p]??[])];}
    // Keep measuring the same cohort even when it drops out of search. Round-robin the oldest
    // readings at the 240-video cap, so missing source data never masquerades as a decline.
    const existing=state.videos.filter(v=>niches.some(n=>matchesNiche(v,n)) && now-Date.parse(v.firstSeen)<30*24*HOUR)
      .sort((a,b)=>Date.parse(a.readings.at(-1)?.at??a.firstSeen)-Date.parse(b.readings.at(-1)?.at??b.firstSeen));
    const known=new Set(state.videos.map(v=>v.id));
    const newIds=[...found.keys()].filter(id=>!known.has(id)).slice(0,60);
    // Bound each platform separately so one network cannot starve the others.
    const available=[...new Set([...newIds,...existing.map(v=>v.id),...found.keys()])];
    for(const v of existing)if(!refs.has(v.id))refs.set(v.id,v);
    const ids=PLATFORMS.flatMap(p=>available.filter(id=>videoPlatform(refs.get(id)??{id})===p).slice(0,80));
    const results=await pool(ids,6,id=>{budget();const ref=refs.get(id)??{id};return videoPlatform(ref)==='youtube'?source.observe(id):source.observeSocial?source.observeSocial(ref):Promise.reject(Error('Social collector unavailable'));});
    const byId=new Map(state.videos.map(v=>[v.id,v]));let observed=0,failed=0;
    for(let i=0;i<results.length;i++) {
      const r=results[i],platform=videoPlatform(refs.get(ids[i])??{id:ids[i]});if(r.status==='rejected'){failed++;health[platform].failed++;if(health[platform].errors.length<3)health[platform].errors.push(`${ids[i]}: ${r.reason instanceof Error?r.reason.message.slice(0,120):'observation unavailable'}`);continue;}
      const video=r.value,old=byId.get(video.id);
      // Search filters are not sufficient evidence of age. Unknown/old dates are not admitted.
      if(!old && (!video.publishedAt || now-Date.parse(video.publishedAt)>(platform==='youtube'?8:30)*24*HOUR || Date.parse(video.publishedAt)>Date.now()))continue;
      const nicheIds=[...new Set([...(old?.nicheIds??[]),...(found.get(video.id)??[])])];
      if(!nicheIds.length)continue;
      byId.set(video.id,old?addReading({...old,title:video.title,channel:video.channel,platform:video.platform,url:video.url,nicheIds},video.readings[0]):{...video,nicheIds}); observed++;health[platform].observed++;
    }
    for(const p of PLATFORMS)errors.push(...health[p].errors.map(e=>`${p}: ${e}`));
    if(failed)errors.push(`${failed} public video pages could not be read; previous measurements retained.`);
    if(!observed)errors.push('No fresh video measurements. Previous data retained.');
    state.videos=[...byId.values()].filter(v=>now-Date.parse(v.firstSeen)<30*24*HOUR);
    const finishedAt=new Date().toISOString();
    state.runs=[...state.runs,{at,finishedAt,observed,discovered,errors,sources:health}].slice(-3000);
    const board=trendBoard(state,niches,Date.now());
    state.history=[...state.history,...board.map(t=>({at:finishedAt,id:t.id,stage:t.stage,velocity:t.velocity}))].filter(h=>Date.now()-Date.parse(h.at)<30*24*HOUR);
    writePrivateJson(path.join(dir,'state.json'),state);
    return state.runs.at(-1)!;
  }finally{fs.closeSync(fd!);fs.unlinkSync(lock);}
}
export async function collectEnabled() {
  for(const p of listBusinesses().profiles) {
    if(!fs.existsSync(path.join(trendDir(p.slug),'niches.json')))continue;
    try{console.log(JSON.stringify({business:p.slug,result:await collectTrends(p.slug)}));}
    catch{console.error(`Trend scan failed for ${p.slug}; next tick will retry.`);}
  }
}

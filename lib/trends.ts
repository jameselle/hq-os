// Pure trend inference. Views are source counters, never estimates or synthetic history.
export const HOUR = 3_600_000;
export const INTERVAL = 15 * 60_000;
export const STAGES = ['Emerging', 'Breaking out', 'Established', 'Fading', 'Watching', 'Stale'] as const;
export type Stage = typeof STAGES[number];
export const PLATFORMS = ['youtube','instagram','tiktok'] as const;
export type Platform = typeof PLATFORMS[number];
export type Niche = {id: string; name: string; query: string; instagram?: string[]; tiktok?: string[]};
export type VideoRef = {id:string;platform?:Platform;url?:string;publishedAt?:string|null;channel?:string;channelId?:string};
export const videoPlatform=(v:VideoRef):Platform=>v.platform??'youtube';
export const videoUrl=(v:VideoRef):string=>v.url??`https://www.youtube.com/watch?v=${v.id}`;
export const MAX_NICHES = 12;
export const MAX_WATCHED_ACCOUNTS = 12;
export const DEFAULT_NICHES: Niche[] = [
  {id:'fitness',name:'Fitness & wellness',query:'fitness workout'},
  {id:'ai',name:'AI & technology',query:'AI tools'},
  {id:'business',name:'Business & creators',query:'creator business'},
  {id:'beauty',name:'Beauty & style',query:'skincare'},
  {id:'food',name:'Food & recipes',query:'recipes cooking'},
  {id:'alcoholic-beverages',name:'Alcoholic beverages',query:'cocktails beer wine spirits'},
  {id:'betting-influencers',name:'Betting influencers',query:'sports betting creators analysis'},
  {id:'betting-ev-odds-tools',name:'Betting / EV & odds screen tools',query:'positive EV betting odds screen software'},
  {id:'odds-api-companies',name:'Odds API companies',query:'sports betting odds API providers'},
];
export type Reading = {at: string; views: number};
export type Video = {platform?:Platform;url?:string;id: string; title: string; channel: string; channelId: string; nicheIds: string[]; publishedAt: string | null; firstSeen: string; readings: Reading[]};
export function matchesNiche(v:Video,n:Niche):boolean {
  const platform=videoPlatform(v);
  return v.nicheIds.includes(n.id) && (platform==='youtube' || (n[platform]??[]).some(h=>h.toLowerCase()===v.channel.replace(/^@/,'').toLowerCase()));
}
export type SourceHealth = {discovered:number;observed:number;failed:number;errors:string[]};
export type Run = {sources?:Partial<Record<Platform,SourceHealth>>;at: string; finishedAt: string; observed: number; discovered: number; errors: string[]};
export type SocialPlatform = 'instagram'|'tiktok';
export type Creator = {platform:SocialPlatform;handle:string;followers:number|null;checkedAt:string;observedAt:string|null;error?:string};
export type State = {creators?:Creator[];discoveryErrors?:Partial<Record<Platform,string[]>>;videos: Video[]; runs: Run[]; lastDiscovery: string | null; history: {at:string; id:string; stage:Stage; velocity:number|null}[]};
export type Trend = {platform:Platform;id:string; title:string; nicheId:string; stage:Stage; reason:string; creators:number; views:number; velocity:number|null; acceleration:number|null; firstSeen:string; lastSeen:string; videos:Video[]; measured:number; history:State['history']};
export function validateNiches(value: unknown): Niche[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_NICHES) throw Error(`Choose between 1 and ${MAX_NICHES} niches.`);
  const ids = new Set<string>();
  return value.map(v => {
    if (!v || typeof v.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(v.id) || ids.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 60 || typeof v.query !== 'string' || !v.query.trim() || v.query.length > 120) throw Error('Each niche needs a unique ID, a name and a search phrase.');
    const handles:Partial<Record<'instagram'|'tiktok',string[]>>={};
    for(const platform of ['instagram','tiktok'] as const){if(v[platform]!==undefined){if(!Array.isArray(v[platform])||v[platform].length>MAX_WATCHED_ACCOUNTS||!v[platform].every((h:unknown)=>typeof h==='string'&&/^[a-zA-Z0-9._]{1,40}$/.test(h)))throw Error(`Use at most ${MAX_WATCHED_ACCOUNTS} public creator handles per platform per niche.`);handles[platform]=[...new Set<string>(v[platform].map((h:string)=>h.toLowerCase()))];}}
    ids.add(v.id); return {id:v.id,name:v.name.trim(),query:v.query.trim(),...handles};
  });
}
export function addReading(video: Video, reading: Reading): Video {
  if (!Number.isSafeInteger(reading.views) || reading.views < 0 || !Number.isFinite(Date.parse(reading.at))) throw Error('Invalid reading');
  const last = video.readings.at(-1);
  if (last && Date.parse(reading.at) - Date.parse(last.at) < INTERVAL * .8) return video;
  return {...video,readings:[...video.readings,reading].filter(r=>Date.parse(r.at)>=Date.parse(reading.at)-30*24*HOUR)};
}
export function movement(v: Video, now: number) {
  const rows = v.readings.filter(r=>Date.parse(r.at)<=now);
  const c = rows.at(-1), b = rows.at(-2), a = rows.at(-3);
  if (!c || now-Date.parse(c.at)>2*INTERVAL) return {velocity:null,previous:null};
  const rate=(x:Reading|undefined,y:Reading|undefined) => {
    if (!x || !y) return null;
    const elapsed=Date.parse(y.at)-Date.parse(x.at);
    return elapsed>=INTERVAL*.8 && elapsed<=2*HOUR && y.views>=x.views ? (y.views-x.views)*HOUR/elapsed : null;
  };
  return {velocity:rate(b,c),previous:rate(a,b)};
}
const STOP = new Set('the a an and or in on at for to of with from this that your you my our how why what is are i it its new best top watch shorts short video videos viral trending trend official full episode day today live part actually use really get can try just more most every must need using used ways things make'.split(' '));
export function phrases(title:string):string[] {
  const words=title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
  const result=new Set<string>();
  for(const match of title.matchAll(/#([\p{L}\p{N}_]{3,40})/gu)){const tag=match[1].toLowerCase();if(!['fyp','foryou','foryoupage','viral','trending','reels','shorts'].includes(tag))result.add(`#${tag}`);}
  for(let i=0;i<words.length-1;i++) {
    const a=words[i],b=words[i+1];
    if((a.length>2||a==='ai') && (b.length>2||b==='ai') && !STOP.has(a) && !STOP.has(b) && !/^\d+$/.test(a+b)) result.add(`${a} ${b}`);
  }
  return [...result];
}
export function trendBoard(state: State, niches: Niche[], now=Date.now()): Trend[] {
  const out:Trend[]=[];
  for(const niche of niches) for(const platform of PLATFORMS) {
    const videos=state.videos.filter(v=>videoPlatform(v)===platform && matchesNiche(v,niche) && Date.parse(v.firstSeen)>now-30*24*HOUR);
    const groups=new Map<string,Video[]>();
    for(const v of videos) for(const phrase of phrases(v.title)) groups.set(phrase,[...(groups.get(phrase)??[]),v]);
    const seen=new Set<string>();
    for(const [title,rows] of [...groups].sort((a,b)=>b[1].length-a[1].length)) {
      const creators=new Set(rows.map(v=>v.channelId)).size;
      if(creators<2) continue;
      const signature=rows.map(v=>v.id).sort().join(',');
      if(seen.has(signature))continue; seen.add(signature);
      const latest=rows.map(v=>v.readings.at(-1)!).filter(Boolean);
      const rates=rows.map(v=>movement(v,now));
      const measured=rates.filter(r=>r.velocity!==null).length;
      const comparable=rates.filter(r=>r.velocity!==null && r.previous!==null);
      const fresh=latest.filter(r=>now-Date.parse(r.at)<=2*INTERVAL).length;
      const velocity=measured ? rates.reduce((s,r)=>s+(r.velocity??0),0) : null;
      const previous=comparable.reduce((s,r)=>s+r.previous!,0);
      const current=comparable.reduce((s,r)=>s+r.velocity!,0);
      const acceleration=previous>0 ? current/previous : null;
      const firstSeen=rows.map(v=>v.firstSeen).sort()[0];
      const id=platform==='youtube'?`${niche.id}:${title}`:`${platform}:${niche.id}:${title}`;
      const history=state.history.filter(h=>h.id===id);
      let stage:Stage='Watching',reason='Collecting repeat measurements. Shared wording is a candidate, not confirmed virality.';
      const growingCreators=new Set(rows.filter((_,i)=>(rates[i].velocity??0)>0).map(v=>v.channelId)).size;
      const sufficient=measured>=3 && measured/rows.length>=.7 && creators>=3;
      const sustained=history.some(h=>['Emerging','Breaking out','Established'].includes(h.stage) && now-Date.parse(h.at)>=24*HOUR);
      if(fresh/rows.length<.7) { stage='Stale';reason='Source readings are missing or older than 30 minutes. No direction inferred.'; }
      else if(sufficient && comparable.length>=3 && comparable.length/rows.length>=.7 && previous>=1000 && acceleration!==null && acceleration<.6 && history.some(h=>['Emerging','Breaking out','Established'].includes(h.stage))) {stage='Fading';reason='Measured view growth fell by more than 40% across comparable posts.';}
      else if(sufficient && growingCreators>=3 && velocity!==null && velocity>=1000) {
        if(acceleration!==null && acceleration>=1.5 && comparable.length>=3 && comparable.length/rows.length>=.7) {stage='Breaking out';reason='At least 3 creators; growth is accelerating at least 1.5× across comparable posts.';}
        else if(sustained) {stage='Established';reason='Strong measured growth, with a positive signal recorded at least 24 hours ago.';}
        else {stage='Emerging';reason='At least 3 creators and 1,000 new views/hour across measured posts. Early signal in this sample.';}
      }
      out.push({platform,id,title,nicheId:niche.id,stage,reason,creators,views:latest.reduce((s,r)=>s+r.views,0),velocity,acceleration,firstSeen,lastSeen:latest.map(r=>r.at).sort().at(-1)??firstSeen,videos:rows,measured,history});
    }
  }
  const priority:Record<Stage,number>={'Breaking out':0,Emerging:1,Established:2,Fading:3,Watching:4,Stale:5};
  return out.sort((a,b)=>priority[a.stage]-priority[b.stage] || (b.velocity??0)-(a.velocity??0) || b.creators-a.creators || b.views-a.views);
}

// Only profile links on the selected platform are accepted; never fetch user-supplied URLs.
export function accountHandle(input:string,platform:SocialPlatform):string {
 let handle=input.trim();
 if(/^https?:\/\//i.test(handle)) {
  const u=new URL(handle),allowed=platform==='instagram'?['instagram.com','www.instagram.com']:['tiktok.com','www.tiktok.com'];
  if(!allowed.includes(u.hostname)||u.username||u.password||u.port)throw Error('Paste a profile link from the selected platform.');
  const parts=u.pathname.split('/').filter(Boolean);
  if(parts.length!==1||(platform==='tiktok'&&!parts[0].startsWith('@')))throw Error('Use an account profile, not a video link.');
  handle=parts[0];
 }
 handle=handle.replace(/^@/,'').toLowerCase();
 if(!/^[a-z0-9._]{1,40}$/.test(handle)||['p','reel','reels','explore','accounts'].includes(handle))throw Error('Enter a valid account handle or profile link.');
 return handle;
}
export type BreakoutRules = {maxFollowers:number;minViews:number;minRatio:number};
export const BREAKOUT_RULES:BreakoutRules={maxFollowers:50000,minViews:100000,minRatio:10};
export function smallAccountBreakouts(videos:Video[],creators:Creator[],rules=BREAKOUT_RULES,now=Date.now()) {
 const profiles=new Map(creators.map(c=>[`${c.platform}:${c.handle.toLowerCase()}`,c]));
 return videos.flatMap(video=>{
  const creator=profiles.get(`${videoPlatform(video)}:${video.channel.replace(/^@/,'').toLowerCase()}`),reading=video.readings.at(-1);
  // Unknown/zero/stale audiences cannot produce a meaningful ratio.
  if(!creator||creator.error||!creator.observedAt||!Number.isSafeInteger(creator.followers)||creator.followers!<=0||creator.followers!>rules.maxFollowers||!reading)return [];
  const followerAge=now-Date.parse(creator.observedAt),viewAge=now-Date.parse(reading.at);
  if(!Number.isFinite(followerAge)||followerAge<0||followerAge>24*HOUR||!Number.isFinite(viewAge)||viewAge<0||viewAge>2*INTERVAL||!Number.isSafeInteger(reading.views)||reading.views<rules.minViews)return [];
  const ratio=reading.views/creator.followers!;
  return ratio>=rules.minRatio?[{video,creator,ratio,topics:phrases(video.title).slice(0,6)}]:[];
 }).sort((a,b)=>b.ratio-a.ratio||b.video.readings.at(-1)!.views-a.video.readings.at(-1)!.views);
}

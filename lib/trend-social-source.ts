// Anonymous, read-only public embeds and profiles. No session or credentials.
import {execFile} from 'node:child_process';
import {type Video,type VideoRef,type Creator,type SocialPlatform} from './trends';
export class SourceUnavailable extends Error {}
async function publicPage(url:string):Promise<string> {
 const r=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'follow'});
 if(!r.ok||new URL(r.url).pathname.includes('/accounts/login'))throw new SourceUnavailable(`Public source unavailable (${r.status}).`);
 const text=await r.text();if(text.length>5_000_000)throw new SourceUnavailable('Public response too large.');return text;
}
function jsonObject(text:string,start:number):unknown {
 let depth=0,quoted=false,escape=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}
  else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(text.slice(start,i+1));
 }throw new SourceUnavailable('Incomplete embed data.');
}
// Decode JSON only, never execute the source page's JavaScript. Instagram embeds
// put their media in nested JSON strings within ServerJS handle objects.
function visitInstagram(html:string,visit:(value:Record<string,any>)=>void):void {
 let visited=0;
 function walk(value:unknown,depth=0):void {
  if(depth>30||++visited>100000)return;
  if(typeof value==='string'&&value.trim().startsWith('{')){try{walk(JSON.parse(value),depth+1);}catch{};return;}
  if(!value||typeof value!=='object')return;
  visit(value as Record<string,any>);
  for(const v of Object.values(value))walk(v,depth+1);
 }
 for(const match of html.matchAll(/s\.handle\((\{)/g)){try{walk(jsonObject(html,match.index!+match[0].length-1));}catch{}}
 for(const match of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)){try{walk(JSON.parse(match[1]));}catch{}}
}
export function instagramMedia(html:string):Record<string,any>[] {
 const found=new Map<string,Record<string,any>>();
 visitInstagram(html,value=>{for(const key of ['shortcode_media','xdt_shortcode_media']){const media=value[key];if(media&&typeof media.shortcode==='string')found.set(media.shortcode,media);}});
 return [...found.values()];
}
export function parseCreator(html:string,platform:SocialPlatform,handle:string,at:string):Creator {
 safeHandle(handle);let followers:unknown;
 if(platform==='instagram') {
  visitInstagram(html,value=>{
   if(typeof value.username==='string'&&value.username.toLowerCase()===handle.toLowerCase()&&value.is_private!==true){
    const count=value.edge_followed_by?.count??value.followers_count;
    if(Number.isSafeInteger(count)&&count>=0)followers=count;
   }
  });
 }else{
  const match=html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  const info=match?JSON.parse(match[1]).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo:null;
  if(info?.user?.uniqueId?.toLowerCase()===handle.toLowerCase()&&info.user.privateAccount!==true){
   const raw=(info.statsV2??info.stats)?.followerCount;
   if(/^\d+$/.test(String(raw)))followers=Number(raw);
  }
 }
 if(!Number.isSafeInteger(followers)||(followers as number)<0)throw new SourceUnavailable('Public follower count unavailable.');
 return {platform,handle:handle.toLowerCase(),followers:followers as number,checkedAt:at,observedAt:at};
}
export async function observeCreator(platform:SocialPlatform,handle:string):Promise<Creator> {
 safeHandle(handle);
 const url=platform==='instagram'?`https://www.instagram.com/${handle}/embed/`:`https://www.tiktok.com/@${handle}`;
 return parseCreator(await publicPage(url),platform,handle,new Date().toISOString());
}
export function safeHandle(handle:string):string {
 if(!/^[a-zA-Z0-9._]{1,40}$/.test(handle))throw Error('Invalid public creator handle');return handle;
}
const epoch=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<1e11?new Date(n*1000).toISOString():null;};
export function instagramRefs(html:string,handle:string):VideoRef[] {
 safeHandle(handle);
 const media=instagramMedia(html);
 if(!media.length)throw new SourceUnavailable('Instagram public profile did not expose posts.');
 return media.filter(m=>m.__typename==='GraphVideo'&&m.owner?.username?.toLowerCase()===handle.toLowerCase()&&/^[\w-]{5,30}$/.test(m.shortcode)).map(m=>({id:`instagram:${m.shortcode}`,platform:'instagram',url:`https://www.instagram.com/reel/${m.shortcode}/`,publishedAt:epoch(m.taken_at_timestamp),channel:handle,channelId:String(m.owner.id??handle)}));
}
export function parseInstagram(html:string,ref:VideoRef,at:string):Video {
 const code=ref.id.replace(/^instagram:/,'');const m=instagramMedia(html).find(m=>m.shortcode===code);
 if(!m||m.__typename!=='GraphVideo'||typeof m.owner?.username!=='string')throw new SourceUnavailable('Instagram Reel data unavailable.');
 // Do not swap plays, likes or hidden values into a view series.
 const views=m.video_view_count;
 if(!Number.isSafeInteger(views)||views<0||m.like_and_view_counts_disabled===true)throw new SourceUnavailable('Instagram did not expose a view count.');
 const caption=m.edge_media_to_caption?.edges?.[0]?.node?.text;
 return {id:ref.id,platform:'instagram',url:`https://www.instagram.com/reel/${code}/`,title:typeof caption==='string'?caption.slice(0,1500):'Untitled Reel',channel:m.owner.username,channelId:String(m.owner.id??m.owner.username),publishedAt:epoch(m.taken_at_timestamp)??ref.publishedAt??null,firstSeen:at,nicheIds:[],readings:[{at,views}]};
}
export function tiktokRefs(raw:unknown,handle:string):VideoRef[] {
 safeHandle(handle);const entries=(raw as {entries?:unknown[]})?.entries;
 if(!Array.isArray(entries)||!entries.length)throw new SourceUnavailable('TikTok public profile did not expose posts.');
 return entries.filter((v):v is Record<string,any>=>!!v&&typeof v==='object').filter(e=>/^\d{15,25}$/.test(String(e.id))).map(e=>({id:`tiktok:${e.id}`,platform:'tiktok',url:`https://www.tiktok.com/@${handle}/video/${e.id}`,channel:handle,publishedAt:epoch(e.timestamp)}));
}
export function parseTikTok(html:string,ref:VideoRef,at:string):Video {
 const match=html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
 if(!match)throw new SourceUnavailable('TikTok did not expose public video data.');
 const item=JSON.parse(match[1]).__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
 if(!item||`tiktok:${item.id}`!==ref.id||typeof item.author?.uniqueId!=='string')throw new SourceUnavailable('TikTok video identity unavailable.');
 // statsV2 is authoritative. Never combine versions or infer missing counters as zero.
 const stats=item.statsV2??item.stats;const raw=stats?.playCount;
 if(!/^\d+$/.test(String(raw)))throw new SourceUnavailable('TikTok view count unavailable.');
 const views=Number(raw);if(!Number.isSafeInteger(views))throw new SourceUnavailable('Invalid TikTok count.');
 return {id:ref.id,platform:'tiktok',url:`https://www.tiktok.com/@${safeHandle(item.author.uniqueId)}/video/${item.id}`,title:String(item.desc??'Untitled video').slice(0,1500),channel:item.author.uniqueId,channelId:String(item.author.id??item.author.uniqueId),publishedAt:epoch(item.createTime),firstSeen:at,nicheIds:[],readings:[{at,views}]};
}
export async function discoverCreator(platform:'instagram'|'tiktok',handle:string):Promise<VideoRef[]> {
 safeHandle(handle);
 if(platform==='instagram')return instagramRefs(await publicPage(`https://www.instagram.com/${handle}/embed/`),handle);
 const listing=(target:string)=>new Promise<string>((resolve,reject)=>execFile('yt-dlp',['--ignore-config','--flat-playlist','--playlist-end','6','--socket-timeout','12','--retries','0','--dump-single-json',target],{timeout:45000,maxBuffer:2*1024*1024},(err,out)=>err?reject(new SourceUnavailable('TikTok public profile listing failed.')):resolve(out)));
 let raw:string;
 try{raw=await listing(`https://www.tiktok.com/@${handle}`);tiktokRefs(JSON.parse(raw),handle);}
 catch{
  // Some public profiles cannot be resolved by handle on every response. Resolve
  // their public secondary ID once; no cookies or browser authentication involved.
  const html=await publicPage(`https://www.tiktok.com/@${handle}`);
  const match=html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  const user=match?JSON.parse(match[1]).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user:null;
  if(!user||String(user.uniqueId).toLowerCase()!==handle.toLowerCase()||typeof user.secUid!=='string'||!/^[\w.-]{10,500}$/.test(user.secUid))throw new SourceUnavailable('TikTok public creator identity unavailable.');
  raw=await listing(`tiktokuser:${user.secUid}`);
 }
 return tiktokRefs(JSON.parse(raw),handle);
}
export function parseTikTokMetadata(raw:unknown,ref:VideoRef,at:string):Video {
 const d=raw as Record<string,any>;
 if(!d||`tiktok:${d.id}`!==ref.id||!Number.isSafeInteger(d.view_count)||d.view_count<0||typeof d.uploader!=='string')throw new SourceUnavailable('TikTok metadata identity or views unavailable.');
 const handle=safeHandle(d.uploader);
 return {id:ref.id,platform:'tiktok',url:`https://www.tiktok.com/@${handle}/video/${d.id}`,title:String(d.description??d.title??'Untitled video').slice(0,1500),channel:handle,channelId:String(d.uploader_id??handle),publishedAt:epoch(d.timestamp),firstSeen:at,nicheIds:[],readings:[{at,views:d.view_count}]};
}
async function tiktokMetadata(ref:VideoRef):Promise<Video> {
 const url=`https://www.tiktok.com/@${safeHandle(ref.channel!)}/video/${ref.id.slice(7)}`;
 const raw=await new Promise<string>((resolve,reject)=>execFile('yt-dlp',['--ignore-config','--skip-download','--socket-timeout','12','--retries','0','--dump-single-json',url],{timeout:30000,maxBuffer:2*1024*1024},(err,out)=>err?reject(new SourceUnavailable('TikTok public video metadata unavailable.')):resolve(out)));
 return parseTikTokMetadata(JSON.parse(raw),ref,new Date().toISOString());
}
export async function observeSocial(ref:VideoRef):Promise<Video> {
 if(ref.platform==='instagram'&&/^instagram:[\w-]{5,30}$/.test(ref.id))return parseInstagram(await publicPage(`https://www.instagram.com/p/${ref.id.slice(10)}/embed/captioned/`),ref,new Date().toISOString());
 if(ref.platform==='tiktok'&&/^tiktok:\d{15,25}$/.test(ref.id)&&ref.channel){
  try{return parseTikTok(await publicPage(`https://www.tiktok.com/@${safeHandle(ref.channel)}/video/${ref.id.slice(7)}`),ref,new Date().toISOString());}
  catch{return tiktokMetadata(ref);}
 }
 throw Error('Invalid social video reference');
}

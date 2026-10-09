// Public YouTube pages only. No login, cookies, API key or video downloads.
import {execFile} from 'node:child_process';
import type {Video} from './trends';
export async function discover(query:string):Promise<string[]> {
  const url=new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query',query);
  url.searchParams.set('sp','EgIIAw=='); // YouTube's upload-this-week filter; verify dates from each video page.
  const raw=await new Promise<string>((resolve,reject)=>{
    execFile('yt-dlp',['--ignore-config','--flat-playlist','--dump-single-json','--playlist-end','24','--socket-timeout','12','--retries','0',url.toString()],{timeout:40000,maxBuffer:2*1024*1024},(err,stdout)=>err?reject(Error('YouTube discovery failed; check yt-dlp and source access.')):resolve(stdout));
  });
  const entries=JSON.parse(raw)?.entries;
  if(!Array.isArray(entries))throw Error('YouTube discovery returned an unsupported response.');
  return [...new Set(entries.map((e:{id?:string})=>e.id).filter((id:unknown):id is string=>typeof id==='string' && /^[\w-]{11}$/.test(id)))];
}
export function parseVideo(html:string,id:string,at:string):Video {
  const match=html.match(/var ytInitialPlayerResponse = (\{.+?\});/);
  if(!match)throw Error('YouTube public statistics unavailable.');
  const player=JSON.parse(match[1]),d=player.videoDetails,m=player.microformat?.playerMicroformatRenderer;
  if(!d || d.videoId!==id || typeof d.title!=='string' || typeof d.channelId!=='string' || typeof d.author!=='string' || !/^\d+$/.test(d.viewCount??''))throw Error('YouTube statistics unavailable.');
  const views=Number(d.viewCount);
  if(!Number.isSafeInteger(views))throw Error('Invalid counter');
  const date=m?.publishDate??m?.uploadDate;
  return {id,title:d.title.slice(0,500),channel:d.author.slice(0,150),channelId:d.channelId,nicheIds:[],publishedAt:date && Number.isFinite(Date.parse(date))?new Date(date).toISOString():null,firstSeen:at,readings:[{at,views}]};
}
export async function observe(id:string):Promise<Video> {
  if(!/^[\w-]{11}$/.test(id))throw Error('Invalid video ID');
  const response=await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`,{signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('YouTube public page unavailable.');
  const html=await response.text();
  if(html.length>5_000_000)throw Error('Source response too large');
  return parseVideo(html,id,new Date().toISOString());
}

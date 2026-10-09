import {movement,videoPlatform,type Video,type Creator} from './trends';
export type PostMetric='views'|'ratio'|'velocity';
export function rankCompetitorPosts(videos:Video[],creators:Creator[],options:{metric:PostMetric;days:number;account?:string;onePerAccount?:boolean},now=Date.now()){
 const rows=videos.filter(v=>videoPlatform(v)!=='youtube'&&v.publishedAt&&Date.parse(v.publishedAt)<=now&&Date.parse(v.publishedAt)>=now-options.days*86400000&&(!options.account||`${videoPlatform(v)}:${v.channel.toLowerCase()}`===options.account)).flatMap(video=>{
  const reading=video.readings.filter(r=>Date.parse(r.at)<=now&&Number.isSafeInteger(r.views)&&r.views>=0).at(-1);if(!reading)return [];
  const creator=creators.find(c=>c.platform===videoPlatform(video)&&c.handle.toLowerCase()===video.channel.replace(/^@/,'').toLowerCase());
  const current=creator&&!creator.error&&creator.followers!=null&&creator.followers>0&&creator.observedAt&&Date.parse(creator.observedAt)<=now&&now-Date.parse(creator.observedAt)<=86400000;
  const stale=now-Date.parse(reading.at)>30*60000;
  const ratio=current&&!stale?reading.views/creator.followers!:null,velocity=movement(video,now).velocity;
  const score=options.metric==='views'?reading.views:options.metric==='ratio'?ratio:velocity;
  return score===null?[]:[{video,views:reading.views,checkedAt:reading.at,followers:current?creator.followers:null,ratio,velocity,score,stale}];
 }).sort((a,b)=>b.score-a.score||b.views-a.views||a.video.id.localeCompare(b.video.id));
 const seen=new Set<string>();return rows.filter(r=>{const key=`${videoPlatform(r.video)}:${r.video.channel.toLowerCase()}`;if(options.onePerAccount&&seen.has(key))return false;seen.add(key);return true;});
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {addReading,HOUR,INTERVAL,movement,trendBoard,validateNiches,type State,type Video} from '../lib/trends';
import {parseVideo} from '../lib/trend-source';
import {collectTrends,readTrends,saveNiches} from '../lib/trend-store';
import {tempData,profile} from './helpers';
const now=Date.parse('2026-10-09T00:00:00Z');
const niches=[{id:'fitness',name:'Fitness',query:'workout'}];
function video(id:string,counts=[1000,1300,1900]):Video{return {id,title:'Pilates workout for beginners',channel:id,channelId:id,nicheIds:['fitness'],publishedAt:new Date(now-HOUR).toISOString(),firstSeen:new Date(now-HOUR).toISOString(),readings:counts.map((views,i)=>({at:new Date(now-(counts.length-1-i)*INTERVAL).toISOString(),views}))};}
function state(videos=[video('a'),video('b'),video('c')]):State{return {videos,runs:[],history:[],lastDiscovery:null};}
test('one snapshot is not a trend, even with enormous views',()=>{
 assert.equal(trendBoard(state([video('a',[9e8]),video('b',[8e8]),video('c',[7e8])]),niches,now)[0].stage,'Watching');
});
test('comparable repeated observations distinguish emerging and accelerating',()=>{
 const t=trendBoard(state(),niches,now)[0];assert.equal(t.stage,'Breaking out');assert.equal(t.velocity,7200);assert.equal(t.acceleration,2);
 const s=state(['a','b','c'].map(id=>video(id,[1000,1300])));assert.equal(trendBoard(s,niches,now)[0].stage,'Emerging');
});
test('one creator cannot imply cross-creator adoption',()=>{
 const s=state(['a','b','c'].map(id=>({...video(id),channelId:'same'})));assert.equal(trendBoard(s,niches,now).length,0);
});
test('missing sources are stale, never fading; falling counters are unknown',()=>{
 assert.equal(trendBoard(state(),niches,now+HOUR)[0].stage,'Stale');
 assert.equal(movement(video('a',[3000,2000,1000]),now).velocity,null);
 const s=state();s.videos[0].readings=s.videos[0].readings.map(r=>({...r,at:new Date(Date.parse(r.at)-HOUR).toISOString()}));assert.equal(trendBoard(s,niches,now)[0].stage,'Stale');
});
test('fading needs prior evidence, established needs a day of evidence',()=>{
 const s=state(['a','b','c'].map(id=>video(id,[1000,2000,2200])));
 const id=trendBoard(s,niches,now)[0].id;
 assert.equal(trendBoard(s,niches,now)[0].stage,'Emerging');
 s.history=[{id,at:new Date(now-HOUR).toISOString(),stage:'Emerging',velocity:12000}];
 assert.equal(trendBoard(s,niches,now)[0].stage,'Fading');
 const stable=state(['a','b','c'].map(id=>video(id,[1000,2000,3000])));
 stable.history=[{id,at:new Date(now-25*HOUR).toISOString(),stage:'Emerging',velocity:12000}];
 assert.equal(trendBoard(stable,niches,now)[0].stage,'Established');
});
test('fast rescans cannot manufacture history; input validation rejects invalid counters and niches',()=>{
 const v=video('a');assert.equal(addReading(v,{at:new Date(now+1000).toISOString(),views:4000}).readings.length,3);
 assert.throws(()=>addReading(v,{at:'bad',views:-1}));assert.throws(()=>validateNiches([{...niches[0],id:'../escape'}]));
 assert.throws(()=>validateNiches([niches[0],niches[0]]));
});
test('public parser requires exact video identity and an actual counter',()=>{
 const p={videoDetails:{videoId:'aaaaaaaaaaa',title:'Pilates workout',author:'Creator',channelId:'channel',viewCount:'123'},microformat:{playerMicroformatRenderer:{publishDate:'2026-10-08'}}};
 const html=`var ytInitialPlayerResponse = ${JSON.stringify(p)};`;
 assert.equal(parseVideo(html,'aaaaaaaaaaa',new Date(now).toISOString()).readings[0].views,123);
 assert.throws(()=>parseVideo(html,'bbbbbbbbbbb',new Date(now).toISOString()));
 assert.throws(()=>parseVideo('consent page','aaaaaaaaaaa',new Date(now).toISOString()));
});
test('end-to-end collector saves source data, deduplicates, retains missing posts and isolates businesses',async()=>{
 const dir=tempData();try{
  for(const slug of ['acme-co','other-co']){fs.mkdirSync(path.join(dir,'businesses',slug),{recursive:true});fs.writeFileSync(path.join(dir,'businesses',slug,'profile.json'),JSON.stringify(profile({slug})));}
  saveNiches('acme-co',niches);
  const at=new Date().toISOString(),fresh={...video('aaaaaaaaaaa',[1000]),firstSeen:at,publishedAt:at,readings:[{at,views:1000}]};
  await collectTrends('acme-co',{force:true},{discover:async()=>['aaaaaaaaaaa','aaaaaaaaaaa'],observe:async()=>fresh});
  assert.equal(readTrends('acme-co').videos.length,1);assert.equal(readTrends('other-co').videos.length,0);
  const file=path.join(dir,'businesses/acme-co/trends/state.json');const s=readTrends('acme-co');s.runs=[];fs.writeFileSync(file,JSON.stringify(s));
  await collectTrends('acme-co',{force:true},{discover:async()=>[],observe:async()=>{throw Error('unavailable');}});
  assert.equal(readTrends('acme-co').videos.length,1);assert.equal(readTrends('acme-co').videos[0].readings.length,1);assert.ok(readTrends('acme-co').runs.at(-1)!.errors.length);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('one growing post among three creators cannot claim spreading growth',()=>{
 const s=state([video('a',[1000,100000]),video('b',[1000,1000]),video('c',[1000,1000])]);
 assert.equal(trendBoard(s,niches,now)[0].stage,'Watching');
});

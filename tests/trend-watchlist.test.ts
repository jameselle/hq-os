import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {accountHandle,smallAccountBreakouts,HOUR,DEFAULT_NICHES,type Video,type Creator} from '../lib/trends';
import {collectTrends,radar,readTrends,saveNiches} from '../lib/trend-store';
import {tempData,profile} from './helpers';
const now=Date.parse('2026-10-09T00:00:00Z'),at=new Date(now).toISOString();
const creator:Creator={platform:'tiktok',handle:'demo_small',followers:4000,checkedAt:at,observedAt:at};
const video:Video={id:'tiktok:1234567890123456789',platform:'tiktok',title:'Cocktail recipe #cocktails',channel:'demo_small',channelId:'42',nicheIds:['alcoholic-beverages'],firstSeen:at,publishedAt:at,readings:[{at,views:120000}]};
test('account chooser accepts handles and platform profile links but never arbitrary URLs',()=>{
 assert.equal(accountHandle(' @Demo_Small ','tiktok'),'demo_small');
 assert.equal(accountHandle('https://www.instagram.com/Demo_Small/?hl=en','instagram'),'demo_small');
 assert.equal(accountHandle('https://www.tiktok.com/@Demo_Small','tiktok'),'demo_small');
 for(const bad of ['https://localhost/demo','https://www.instagram.com.evil.test/demo','https://www.instagram.com/p/123','https://user@instagram.com/demo','https://instagram.com:444/demo','../file','x y'])assert.throws(()=>accountHandle(bad,'instagram'));
 assert.throws(()=>accountHandle('https://www.instagram.com/demo','tiktok'));
 assert.ok(DEFAULT_NICHES.some(n=>n.id==='alcoholic-beverages'));
});
test('small-account breakouts rank genuine ratios and require both reach and audience evidence',()=>{
 const result=smallAccountBreakouts([video],[creator],undefined,now);
 assert.equal(result.length,1);assert.equal(result[0].ratio,30);assert.ok(result[0].topics.includes('#cocktails'));
 for(const followers of [null,0,-1,50001,NaN])assert.equal(smallAccountBreakouts([video],[{...creator,followers}],undefined,now).length,0);
 assert.equal(smallAccountBreakouts([{...video,readings:[{at,views:99999}]}],[creator],undefined,now).length,0);
 assert.equal(smallAccountBreakouts([video],[{...creator,followers:20000}],undefined,now).length,0);
 assert.equal(smallAccountBreakouts([video],[{...creator,followers:20000}],{maxFollowers:50000,minViews:100000,minRatio:5},now).length,1);
 assert.equal(smallAccountBreakouts([video],[{...creator,platform:'instagram'}],undefined,now).length,0);
});
test('stale, failed, future, or missing follower snapshots cannot qualify as breakouts',()=>{
 for(const c of [{...creator,observedAt:null},{...creator,error:'unavailable'},{...creator,observedAt:new Date(now-25*HOUR).toISOString()},{...creator,observedAt:'bad'},{...creator,observedAt:new Date(now+HOUR).toISOString()}])assert.equal(smallAccountBreakouts([video],[c],undefined,now).length,0);
 assert.equal(smallAccountBreakouts([{...video,readings:[{at:new Date(now-HOUR).toISOString(),views:120000}]}],[creator],undefined,now).length,0);
 assert.equal(smallAccountBreakouts([video],[],undefined,now).length,0);
});
test('watchlist changes collect new accounts immediately, retain profile evidence, and remove niche membership',async()=>{
 const dir=tempData();try{
  const slug='acme-co',base=path.join(dir,'businesses',slug);fs.mkdirSync(base,{recursive:true});fs.writeFileSync(path.join(base,'profile.json'),JSON.stringify(profile()));
  const niche={id:'alcoholic-beverages',name:'Alcoholic beverages',query:'cocktails',tiktok:['demo_small']};
  saveNiches(slug,[niche]);
  const time=new Date().toISOString();let profileFail=false;
  const source={discover:async()=>[],observe:async()=>{throw Error('unused');},discoverCreator:async()=>[{id:video.id,platform:'tiktok' as const,channel:'demo_small'}],observeSocial:async()=>({...video,firstSeen:time,publishedAt:time,readings:[{at:time,views:120000}]}),observeCreator:async()=>{if(profileFail)throw Error('unavailable');return {...creator,checkedAt:time,observedAt:time};}};
  await collectTrends(slug,{force:true},source);
  const r=radar(slug);assert.equal(r.creators[0].followers,4000);assert.equal(smallAccountBreakouts(r.videos,r.creators).length,1);
  // Config changes must not be swallowed by the recent-scan cooldown.
  const newNiches=[niche,{...niche,id:'food',name:'Food'}];saveNiches(slug,newNiches);
  const future=new Date(Date.now()+1000);fs.utimesSync(path.join(base,'trends/niches.json'),future,future);
  profileFail=true;await collectTrends(slug,{force:true},source);
  assert.equal(readTrends(slug).runs.length,2);assert.equal(radar(slug).creators[0].followers,4000);assert.ok(radar(slug).creators[0].error);assert.equal(smallAccountBreakouts(radar(slug).videos,radar(slug).creators).length,0);
  saveNiches(slug,[{...niche,tiktok:[]},newNiches[1]]);
  assert.deepEqual(radar(slug).videos[0].nicheIds,['food']);
  saveNiches(slug,[{...niche,tiktok:[]}]);assert.equal(radar(slug).videos.length,0);assert.equal(radar(slug).creators.length,0);assert.equal(readTrends(slug).videos.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

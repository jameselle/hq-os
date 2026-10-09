import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {tempData,profile} from './helpers';
import {saveNiches,readNiches,trendDir} from '../lib/trend-store';
import {createFeedSession,pairFeed,ingestFeed,feedView,stopFeed,canonicalFeedPost,watchFeedAccount,refreshFeed,readFeed,pendingFeeds,connectFeed} from '../lib/feed-collector';
const niche={id:'tools',name:'Tools',query:'widgets'};
function setup(){const dir=tempData();for(const slug of ['acme-co','other-co']){fs.mkdirSync(path.join(dir,'businesses',slug),{recursive:true});fs.writeFileSync(path.join(dir,'businesses',slug,'profile.json'),JSON.stringify(profile({slug})));saveNiches(slug,[niche]);}return dir;}
const config={platform:'instagram',nicheId:'tools',maxPosts:10,minutes:2};
const post={url:'https://www.instagram.com/reel/ABCDE123/',handle:'maker',caption:'Widget demo',visible:{likes:'1.2K'}};
test('pairing is one-use and platform-bound; token writes only its business; stopping revokes ingestion',()=>{
 const dir=setup();try{const created=createFeedSession('acme-co',config);assert.throws(()=>pairFeed(created.code,'tiktok'));const pair=pairFeed(created.code,'instagram');assert.throws(()=>pairFeed(created.code,'instagram'));assert.throws(()=>ingestFeed('other-co',pair.id,pair.token,{posts:[post]}));assert.throws(()=>ingestFeed('acme-co',pair.id,'wrong',{posts:[post]}));assert.throws(()=>createFeedSession('acme-co',config));
 const result=ingestFeed('acme-co',pair.id,pair.token,{posts:[post,post,{url:'https://evil.example/reel/ABCDE/'}]});assert.equal(result.count,1);assert.equal(result.rejected,1);assert.equal(feedView('acme-co').posts.length,1);assert.equal(feedView('other-co').posts.length,0);assert.ok(!JSON.stringify(feedView('acme-co')).includes('tokenHash'));assert.ok(!fs.readFileSync(path.join(trendDir('acme-co'),'feed.json'),'utf8').includes(pair.token));
 watchFeedAccount('acme-co',feedView('acme-co').posts[0].id);assert.deepEqual(readNiches('acme-co')[0].instagram,['maker']);stopFeed('acme-co',pair.id);const stopped=ingestFeed('acme-co',pair.id,pair.token,{posts:[{...post,url:'https://instagram.com/reel/OTHER123/'}]});assert.equal(stopped.stop,true);assert.equal(feedView('acme-co').posts.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('session post and time limits are enforced on server; expired codes cannot pair',()=>{
 const dir=setup();try{const c=createFeedSession('acme-co',config),p=pairFeed(c.code,'instagram');const r=ingestFeed('acme-co',p.id,p.token,{posts:Array.from({length:10},(_,i)=>({...post,url:`https://instagram.com/reel/ABCDE${i}/`}))});assert.equal(r.stop,true);assert.equal(r.count,10);assert.equal(r.status,'complete');
 const next=createFeedSession('acme-co',config);const state=readFeed('acme-co');state.sessions[0].createdAt=new Date(Date.now()-11*60000).toISOString();fs.writeFileSync(path.join(trendDir('acme-co'),'feed.json'),JSON.stringify(state));assert.throws(()=>pairFeed(next.code,'instagram'));assert.equal(feedView('acme-co').sessions[0].status,'expired');
 const last=pairFeed(createFeedSession('acme-co',config).code,'instagram');const current=readFeed('acme-co');current.sessions[0].startedAt=new Date(Date.now()-3*60000).toISOString();fs.writeFileSync(path.join(trendDir('acme-co'),'feed.json'),JSON.stringify(current));assert.equal(ingestFeed('acme-co',last.id,last.token,{posts:[post]}).stop,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('URLs canonicalise safely and feed likes never become view measurements',async()=>{
 assert.equal(canonicalFeedPost({...post,url:'https://instagram.com/maker/p/ABCDE123/?x=1'},'instagram').url,'https://www.instagram.com/p/ABCDE123/');assert.throws(()=>canonicalFeedPost({...post,url:'https://instagram.com.evil.example/reel/ABCDE123/'},'instagram'));assert.throws(()=>canonicalFeedPost({...post,url:'https://instagram.com:8888/reel/ABCDE123/'},'instagram'));assert.throws(()=>pairFeed('../bad.id.secret','instagram'));
 const dir=setup();try{const p=pairFeed(createFeedSession('acme-co',config).code,'instagram');ingestFeed('acme-co',p.id,p.token,{posts:[post]});assert.equal(feedView('acme-co').posts[0].verified,undefined);await refreshFeed('acme-co',async()=>{throw Error('Blocked');});assert.equal(feedView('acme-co').posts[0].verified,undefined);assert.match(feedView('acme-co').posts[0].checkError!,/unavailable/);assert.equal(feedView('acme-co').posts[0].visible.likes,'1.2K');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('extension accepts supported feed pages and strict post URLs without executing on load',()=>{
 const context=vm.createContext({URL,location:{origin:'https://www.instagram.com',pathname:'/reels/ABCDE123/'}});vm.runInContext(fs.readFileSync('extensions/hq-feed-collector/extractor.js','utf8'),context);const x=context.HQFeedExtractor;assert.equal(x.allowed('instagram'),true);assert.equal(x.postURL('/maker/p/ABCDE123/?x=1','instagram'),'https://www.instagram.com/p/ABCDE123/');assert.equal(x.postURL('https://evil.example/reel/ABCDE123/','instagram'),null);context.location.pathname='/direct/inbox/';assert.equal(x.allowed('instagram'),false);context.location.pathname='/foryou';assert.equal(x.allowed('tiktok'),true);assert.equal(x.postURL('https://www.tiktok.com/@maker/video/12345678901234?x=1','tiktok'),'https://www.tiktok.com/@maker/video/12345678901234');
});
test('extension binds ingestion to the explicitly started tab and clears access when HQ stops',async()=>{
 let listener:Function=()=>{},onUpdated:Function=()=>{},active:any;const requests:any[]=[];const runtimeId='a'.repeat(32);
 const chrome={runtime:{id:runtimeId,onMessage:{addListener:(fn:Function)=>{listener=fn;}}},storage:{session:{get:async()=>({active}),set:async(v:any)=>{active=v.active;},remove:async()=>{active=undefined;}}},tabs:{query:async()=>[{id:7,url:'https://www.instagram.com/reels/ABCDE123/'}],sendMessage:async()=>({ok:true,running:true}),onRemoved:{addListener:()=>{}},onUpdated:{addListener:(fn:Function)=>{onUpdated=fn;}}},scripting:{executeScript:async()=>{}},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}}};
 const context=vm.createContext({chrome,URL,AbortSignal,fetch:async(_url:string,options:any)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>requests.at(-1).action==='connect'?{slug:'acme-co',id:'session',token:'test-token',platform:'instagram',minutes:2,startedAt:new Date().toISOString()}:{stop:true,count:10,reason:'Post limit reached'}};}});vm.runInContext(fs.readFileSync('extensions/hq-feed-collector/background.js','utf8'),context);
 const send=(msg:any,sender:any)=>new Promise<any>(resolve=>listener(msg,sender,resolve));
 assert.equal((await send({type:'HQ_START',slug:'acme-co',id:'session'},{id:runtimeId})).ok,true);assert.equal(active.tabId,7);await onUpdated(7,{status:'loading',url:'https://www.instagram.com/reels/OTHER123/'});assert.equal(active.tabId,7);await onUpdated(7,{status:'complete'});assert.equal(active.tabId,7);
 assert.match((await send({type:'HQ_BATCH',posts:[post]},{id:runtimeId,tab:{id:8},frameId:0,url:'https://www.instagram.com/reels/'})).error,/authorised/);assert.equal(requests.length,1);
 const result=await send({type:'HQ_BATCH',posts:[post]},{id:runtimeId,tab:{id:7},frameId:0,url:'https://www.instagram.com/reels/'});assert.equal(result.stop,true);assert.equal(active,undefined);assert.equal(requests[1].slug,'acme-co');assert.equal(requests[1].token,undefined);
});
test('Explore post links gain creator and caption from a public check',async()=>{
 const dir=setup();try{const p=pairFeed(createFeedSession('acme-co',config).code,'instagram');ingestFeed('acme-co',p.id,p.token,{posts:[{url:'https://www.instagram.com/p/EXPLORE123/'}]});await refreshFeed('acme-co',async ref=>({...ref,title:'A public widget demonstration',channel:'widgetmaker',channelId:'widgetmaker',firstSeen:new Date().toISOString(),publishedAt:null,nicheIds:[],readings:[{at:new Date().toISOString(),views:12345}]}));const row=feedView('acme-co').posts[0];assert.equal(row.handle,'widgetmaker');assert.equal(row.caption,'A public widget demonstration');assert.equal(row.verified?.views,12345);watchFeedAccount('acme-co',row.id);assert.deepEqual(readNiches('acme-co')[0].instagram,['widgetmaker']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('automatic connection selects a bounded waiting session without exposing secrets',()=>{
 const dir=setup();try{
 const a=createFeedSession('acme-co',config),b=createFeedSession('other-co',config);
 const pending=pendingFeeds('instagram');assert.equal(pending.length,2);assert.equal(pendingFeeds('tiktok').length,0);
 assert.ok(!JSON.stringify(pending).includes('Hash'));assert.ok(!JSON.stringify(pending).includes(a.code));
 assert.throws(()=>connectFeed('other-co',a.sessionId,'instagram'));
 assert.throws(()=>connectFeed('acme-co',a.sessionId,'tiktok'));
 const connected=connectFeed('acme-co',a.sessionId,'instagram');assert.equal(connected.slug,'acme-co');assert.equal(connected.maxPosts,10);
 assert.throws(()=>connectFeed('acme-co',a.sessionId,'instagram'));assert.throws(()=>pairFeed(a.code,'instagram'));
 assert.equal(pendingFeeds('instagram')[0].id,b.sessionId);stopFeed('other-co',b.sessionId);assert.equal(pendingFeeds('instagram').length,0);
 assert.equal(ingestFeed(connected.slug,connected.id,connected.token,{posts:[post]}).count,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseCreator,instagramRefs,parseInstagram,parseTikTok,parseTikTokMetadata,tiktokRefs} from '../lib/trend-social-source';
import {matchesNiche,trendBoard,validateNiches,type State,type Video,type VideoRef} from '../lib/trends';
import {collectTrends,readTrends,saveNiches,radar} from '../lib/trend-store';
import {tempData,profile} from './helpers';
const at='2026-10-09T00:00:00.000Z';
const media={__typename:'GraphVideo',shortcode:'DEMO_reel11',taken_at_timestamp:1791417600,owner:{username:'demo_creator',id:'42'},video_view_count:12345,edge_media_to_caption:{edges:[{node:{text:'Pilates workout #winterarc'}}]}};
const embed=(m:object)=>`<script>requireLazy([],function(){s.handle(${JSON.stringify({require:[['widget',JSON.stringify({graphql_media:[{shortcode_media:m}]})]]})});});</script>`;
const ref:VideoRef={id:'instagram:DEMO_reel11',platform:'instagram',channel:'demo_creator',publishedAt:at};
test('Instagram parses nested embed JSON, captures views, and preserves discovery date',()=>{
 const refs=instagramRefs(embed(media),'demo_creator');assert.equal(refs.length,1);assert.equal(refs[0].id,ref.id);
 const {taken_at_timestamp,...post}=media;
 const v=parseInstagram(embed(post),refs[0],at);assert.equal(v.readings[0].views,12345);assert.equal(v.publishedAt,refs[0].publishedAt);assert.match(v.url!,/^https:\/\/www.instagram.com\/reel\//);
});
test('Instagram refuses identity mismatches, hidden counters and likes-only posts',()=>{
 assert.throws(()=>parseInstagram(embed({...media,shortcode:'different'}),ref,at));
 assert.throws(()=>parseInstagram(embed({...media,video_view_count:undefined,edge_liked_by:{count:99999}}),ref,at));
 assert.throws(()=>parseInstagram(embed({...media,like_and_view_counts_disabled:true}),ref,at));
 assert.equal(instagramRefs(embed({...media,owner:{username:'other'}}),'demo_creator').length,0);
 assert.throws(()=>instagramRefs('<html>Sign in</html>','demo_creator'));
});
const ttRef:VideoRef={id:'tiktok:1234567890123456789',platform:'tiktok',channel:'demo_creator'};
const tiktok=(item:object)=>`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:item}}}})}</script>`;
const item={id:'1234567890123456789',desc:'Pilates workout',createTime:1791417600,author:{uniqueId:'demo_creator',id:'42'},stats:{playCount:1000},statsV2:{playCount:'1234'}};
test('TikTok takes statsV2 and never falls back when that version lacks the counter',()=>{
 assert.equal(parseTikTok(tiktok(item),ttRef,at).readings[0].views,1234);
 assert.throws(()=>parseTikTok(tiktok({...item,statsV2:{diggCount:'10'}}),ttRef,at));
 assert.throws(()=>parseTikTok(tiktok({...item,id:'different'}),ttRef,at));
 assert.throws(()=>parseTikTok('<html>Sign in</html>',ttRef,at));
 assert.equal(tiktokRefs({entries:[{id:item.id}]},'demo_creator')[0].id,ttRef.id);
 assert.throws(()=>tiktokRefs({entries:[]},'demo_creator'));
});
test('creator config is bounded and does not permit URLs or arbitrary source hosts',()=>{
 const niche={id:'fitness',name:'Fitness',query:'workout'};
 assert.throws(()=>validateNiches([{...niche,instagram:['https://internal.example']}]))
 assert.throws(()=>validateNiches([{...niche,tiktok:Array(13).fill('demo')}]))
 assert.deepEqual(validateNiches([{...niche,instagram:['demo','demo']}])[0].instagram,['demo']);
});
test('same creator IDs on separate platforms cannot create cross-platform virality',()=>{
 const videos:Video[]=['youtube','instagram','tiktok'].map((p,i)=>({id:`${p}:123`,platform:p as Video['platform'],title:'Pilates workout',channel:`creator${i}`,channelId:`${i}`,nicheIds:['fitness'],firstSeen:at,publishedAt:at,readings:[{at,views:90000}]}));
 const s:State={videos,runs:[],history:[],lastDiscovery:null};
 assert.equal(trendBoard(s,[{id:'fitness',name:'Fitness',query:'workout'}],Date.parse(at)).length,0);
});
test('collector stores all platforms separately and preserves social evidence on failed refresh',async()=>{
 const dir=tempData();try{
  const slug='acme-co';fs.mkdirSync(path.join(dir,'businesses',slug),{recursive:true});fs.writeFileSync(path.join(dir,'businesses',slug,'profile.json'),JSON.stringify(profile()));
  saveNiches(slug,[{id:'fitness',name:'Fitness',query:'workout',instagram:['demo_creator'],tiktok:['demo_creator']}]);
  const time=new Date().toISOString();
  const video=(id:string,platform:Video['platform']):Video=>({id,platform,title:'Pilates workout',channel:'demo_creator',channelId:'42',publishedAt:time,firstSeen:time,nicheIds:[],readings:[{at:time,views:1234}]});
  const sources={discover:async()=>['aaaaaaaaaaa'],observe:async()=>video('aaaaaaaaaaa','youtube'),discoverCreator:async(p:'instagram'|'tiktok')=>[{id:p==='instagram'?ref.id:ttRef.id,platform:p,channel:'demo_creator'}],observeSocial:async(r:VideoRef)=>video(r.id,r.platform)};
  await collectTrends(slug,{force:true},sources);
  assert.equal(readTrends(slug).videos.length,3);assert.equal(radar(slug).sources.filter(s=>s.status==='live').length,3);
  const s=readTrends(slug);s.runs=[];fs.writeFileSync(path.join(dir,'businesses',slug,'trends/state.json'),JSON.stringify(s));
  await collectTrends(slug,{force:true},{...sources,observeSocial:async()=>{throw Error('Public source unavailable');}});
  assert.equal(readTrends(slug).videos.length,3);assert.equal(radar(slug).sources.find(s=>s.platform==='instagram')!.status,'partial');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('TikTok fallback validates identity and never fabricates a missing counter',()=>{
 const d={id:'1234567890123456789',uploader:'demo_creator',uploader_id:'42',view_count:1234,timestamp:1791417600,description:'Pilates workout'};
 assert.equal(parseTikTokMetadata(d,ttRef,at).readings[0].views,1234);
 assert.throws(()=>parseTikTokMetadata({...d,view_count:null},ttRef,at));
 assert.throws(()=>parseTikTokMetadata({...d,id:'another'},ttRef,at));
});

test('removed creators stop contributing without deleting saved history',()=>{
 const v:Video={id:'instagram:demo',platform:'instagram',title:'Pilates workout',channel:'demo_creator',channelId:'42',nicheIds:['fitness'],firstSeen:at,publishedAt:at,readings:[{at,views:100}]};
 const n={id:'fitness',name:'Fitness',query:'workout',instagram:['DEMO_CREATOR']};
 assert.equal(matchesNiche(v,n),true);
 assert.equal(matchesNiche(v,{...n,instagram:['replacement']}),false);
 assert.equal(matchesNiche({...v,platform:'youtube'}, {...n,instagram:[]}),true);
});

test('follower parsers require matching public profile identity and exact numeric counts',()=>{
 const profile={username:'demo_creator',is_private:false,edge_followed_by:{count:4500}};
 assert.equal(parseCreator(embed({owner:profile}),'instagram','DEMO_CREATOR',at).followers,4500);
 assert.throws(()=>parseCreator(embed({owner:{...profile,username:'other'}}),'instagram','demo_creator',at));
 assert.throws(()=>parseCreator(embed({owner:{...profile,is_private:true}}),'instagram','demo_creator',at));
 assert.throws(()=>parseCreator(embed({owner:{...profile,edge_followed_by:{count:'4.5K'}}}),'instagram','demo_creator',at));
 const tt=(user:object,stats:object,statsV2?:object)=>`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({__DEFAULT_SCOPE__:{'webapp.user-detail':{userInfo:{user,stats,statsV2}}}})}</script>`;
 const user={uniqueId:'demo_creator'};
 assert.equal(parseCreator(tt(user,{followerCount:4500}),'tiktok','demo_creator',at).followers,4500);
 assert.equal(parseCreator(tt(user,{followerCount:4500},{followerCount:'5000'}),'tiktok','demo_creator',at).followers,5000);
 assert.throws(()=>parseCreator(tt(user,{followerCount:4500},{}),'tiktok','demo_creator',at));
 assert.throws(()=>parseCreator(tt({...user,privateAccount:true},{followerCount:4500}),'tiktok','demo_creator',at));
 assert.throws(()=>parseCreator(tt({uniqueId:'other'},{followerCount:4500}),'tiktok','demo_creator',at));
});

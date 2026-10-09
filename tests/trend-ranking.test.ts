import {test} from 'node:test';import assert from 'node:assert/strict';
import {rankCompetitorPosts} from '../lib/trend-ranking';import type {Video,Creator} from '../lib/trends';
const now=Date.now(),at=(offset:number)=>new Date(now+offset).toISOString();
const video=(id:string,channel:string,views:number):Video=>({id,channel,channelId:channel,platform:'instagram',title:id,nicheIds:['demo'],publishedAt:at(-86400000),firstSeen:at(-3600000),readings:[{at:at(-900000),views:views-100},{at:at(0),views}]});
const creator=(handle:string,followers:number):Creator=>({handle,followers,platform:'instagram',checkedAt:at(0),observedAt:at(0)});
test('competitor leaderboard ranks actual social views, normalizes valid audiences, filters dates/accounts and chooses best per account',()=>{
 const rows=[video('a','large',10000),video('b','small',5000),video('c','small',4000),{...video('old','large',900000),publishedAt:at(-31*86400000)},{...video('yt','large',100000),platform:'youtube' as const}];const creators=[creator('large',10000),creator('small',100)];
 assert.deepEqual(rankCompetitorPosts(rows,creators,{metric:'views',days:30},now).map(r=>r.video.id),['a','b','c']);
 assert.deepEqual(rankCompetitorPosts(rows,creators,{metric:'ratio',days:30,onePerAccount:true},now).map(r=>r.video.id),['b','a']);
 assert.equal(rankCompetitorPosts(rows,creators,{metric:'views',days:30,account:'instagram:small'},now).length,2);
 assert.equal(rankCompetitorPosts([video('v','zero',100)], [creator('zero',0)],{metric:'ratio',days:30},now).length,0);
 assert.equal(rankCompetitorPosts([{...video('v','small',100),readings:[{at:at(-3600000),views:100}]}],creators,{metric:'ratio',days:30},now).length,0);
 assert.equal(rankCompetitorPosts(rows,creators,{metric:'velocity',days:30},now)[0].velocity,400);
});

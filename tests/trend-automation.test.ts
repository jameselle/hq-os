import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tempData,profile} from './helpers';
import {saveNiches,readNiches} from '../lib/trend-store';
import {saveSchedule,readSchedules,tickDiscovery,toggleSchedule,discoveryDefaults} from '../lib/trend-automation';
import {enrichOfficialLinks,parseDiscovery} from '../lib/trend-discovery';
import {officialHandles,publicAddress} from '../lib/trend-official-links';
const niche={id:'tools',name:'Tools',query:'widgets'};
test('official website link extraction is platform-specific and excludes posts, seeds and duplicates',async()=>{
 const html='<a href="https://instagram.com/rival/">IG</a><a href="https://instagram.com/p/ABC/">post</a><a href="https://tiktok.com/@rival">TT</a><a href="https://instagram.com/rival/">duplicate</a>';
 assert.deepEqual(officialHandles(html,'instagram'),['rival']);assert.deepEqual(officialHandles(html,'tiktok'),['rival']);
 const result=await enrichOfficialLinks({summary:'Matches',candidates:[],websites:[{url:'https://brand.example',name:'Rival',reason:'Direct competitor. Same audience.'}]},'instagram','seed',async()=>html);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].officialSource,true);
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8 8 8 8'.replaceAll(' ','.')),true);
});
test('automatic discovery persists cadence, isolates businesses, respects pause, and auto-watches only official readable direct matches',async()=>{
 const dir=tempData();try{
 for(const slug of ['acme-co','other-co']){fs.mkdirSync(path.join(dir,'businesses',slug),{recursive:true});fs.writeFileSync(path.join(dir,'businesses',slug,'profile.json'),JSON.stringify(profile({slug})));saveNiches(slug,[niche]);}
 assert.equal(discoveryDefaults('acme-co').seeds.instagram,'@acme');
 const rule=saveSchedule('acme-co',{seed:'acme',platform:'instagram',nicheId:'tools',focus:'Widgets',hours:24,enabled:true,autoWatch:true})[0];
 let calls=0;const runner=async()=>{calls++;return {summary:'Real structure with injected fixture data.',candidates:['direct','adjacent','unreadable','unofficial'].map(handle=>({...parseDiscovery({summary:'',candidates:[{url:`https://instagram.com/${handle}/`,name:handle,reason:handle==='adjacent'?'Adjacent brand. Related audience.':'Direct competitor. Same product.',evidence:'https://brand.example'}]},'instagram','acme').candidates[0],officialSource:handle!=='unofficial',profileChecked:handle!=='unreadable'}))};};
 await tickDiscovery('acme-co',runner);assert.deepEqual(readNiches('acme-co')[0].instagram,['direct']);assert.equal(readSchedules('other-co').length,0);
 await tickDiscovery('acme-co',runner);assert.equal(calls,1);assert.ok(readSchedules('acme-co')[0].lastRun);
 toggleSchedule('acme-co',rule.id,false);await tickDiscovery('acme-co',runner,Date.now()+2*86400000);assert.equal(calls,1);
 toggleSchedule('acme-co',rule.id,true);await tickDiscovery('acme-co',async()=>{throw Error('Usage exhausted')},Date.now()+2*86400000);assert.equal(readSchedules('acme-co')[0].error,'Usage exhausted');assert.deepEqual(readNiches('acme-co')[0].instagram,['direct']);
 assert.throws(()=>saveSchedule('acme-co',{seed:'acme',platform:'instagram',nicheId:'missing',focus:'',hours:24,enabled:true,autoWatch:true}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

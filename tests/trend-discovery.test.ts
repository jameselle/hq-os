import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseDiscovery,startDiscovery,readDiscoveries,watchDiscovered,discoveryArgs,type DiscoveryRun} from '../lib/trend-discovery';
import {saveNiches,readNiches} from '../lib/trend-store';
import {tempData,profile} from './helpers';
const input={summary:'Related product providers.',candidates:[{url:'https://www.instagram.com/demo_rival/',name:'Demo Rival',reason:'Same product category and audience.',evidence:'https://example.com/product'}]};
const run:DiscoveryRun={id:'test-run',at:new Date().toISOString(),status:'running',platform:'instagram',seed:'demo_seed',nicheId:'tools',focus:'Tools',candidates:[]};
test('discovery accepts only sourced profile links on the requested platform, excludes seed and duplicates',()=>{
 const c=input.candidates[0];const parsed=parseDiscovery({...input,candidates:[c,c,{...c,url:'https://instagram.com/demo_seed/'},{...c,url:'https://tiktok.com/@demo_rival'},{...c,url:'https://instagram.com/p/123/'},{...c,evidence:'http://localhost/secret'},{...c,url:'https://instagram.com/new_rival/',evidence:'https://127.0.0.1/'}]},'instagram','demo_seed');
 assert.equal(parsed.candidates.length,1);assert.equal(parsed.candidates[0].handle,'demo_rival');assert.equal(parsed.candidates[0].profileChecked,false);assert.equal(parsed.candidates[0].followers,null);
 assert.throws(()=>parseDiscovery({},'instagram','demo_seed'));
 assert.equal(parseDiscovery({...input,candidates:[{...c,evidence:'See [official source](https://example.com/official).'}]},'instagram','demo_seed').candidates[0].evidence,'https://example.com/official');
 assert.equal(parseDiscovery({...input,candidates:[{...c,evidence:'See [source](https://127.0.0.1/private).'}]},'instagram','demo_seed').candidates.length,0);
 assert.equal(parseDiscovery({...input,candidates:[{...c,url:'https://www.tiktok.com/@demo_rival'}]},'tiktok','demo_seed').candidates.length,1);
});
test('research runtime disables shell/apps and uses structured output without bypassing permissions',()=>{
 const args=discoveryArgs(run,'/tmp/demo-research');assert.ok(args.includes('read-only'));assert.ok(args.includes('shell_tool'));assert.ok(args.includes('unified_exec'));assert.ok(args.includes('apps'));assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ephemeral'));assert.ok(args.includes('--output-schema'));assert.ok(args.includes('web_search="live"'));assert.equal(args.some(a=>a.includes('dangerously-bypass')),false);
});
test('discover, persist, select and watch workflow is isolated and bounded',async()=>{
 const dir=tempData();try{
 for(const slug of ['acme-co','other-co']){fs.mkdirSync(path.join(dir,'businesses',slug),{recursive:true});fs.writeFileSync(path.join(dir,'businesses',slug,'profile.json'),JSON.stringify(profile({slug})));saveNiches(slug,[{id:'tools',name:'Tools',query:'analytics tools',instagram:['existing']}]);}
 let finish!:(r:ReturnType<typeof parseDiscovery>)=>void;
 const pending=new Promise<ReturnType<typeof parseDiscovery>>(resolve=>{finish=resolve;});
 const job=startDiscovery('acme-co',{platform:'instagram',seed:'@demo_seed',nicheId:'tools'},async()=>pending);
 assert.equal(readDiscoveries('acme-co')[0].status,'running');assert.equal(readDiscoveries('other-co').length,0);
 assert.throws(()=>startDiscovery('acme-co',{platform:'instagram',seed:'@demo_seed',nicheId:'tools'},async()=>pending));
 finish(parseDiscovery(input,'instagram','demo_seed'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(readDiscoveries('acme-co')[0].status,'complete');assert.deepEqual(readNiches('acme-co')[0].instagram,['existing']);
 assert.throws(()=>watchDiscovered('acme-co',job.id,['invented']));
 watchDiscovered('acme-co',job.id,['demo_rival']);assert.deepEqual(readNiches('acme-co')[0].instagram,['existing','demo_rival']);
 watchDiscovered('acme-co',job.id,['demo_rival']);assert.equal(readNiches('acme-co')[0].instagram?.length,2);
 assert.throws(()=>watchDiscovered('other-co',job.id,['demo_rival']));
 saveNiches('acme-co',[{id:'tools',name:'Tools',query:'tools',instagram:Array.from({length:12},(_,i)=>`account${i}`)}]);assert.throws(()=>watchDiscovered('acme-co',job.id,['demo_rival']));assert.equal(readNiches('acme-co')[0].instagram?.length,12);
 let excluded:string[]=[];
 const more=startDiscovery('acme-co',{platform:'instagram',seed:'demo_seed',nicheId:'tools'},async r=>{excluded=r.exclude??[];return parseDiscovery(input,'instagram','demo_seed');});await new Promise(resolve=>setImmediate(resolve));assert.ok(excluded.includes('demo_rival'));assert.equal(readDiscoveries('acme-co').find(r=>r.id===more.id)?.candidates.length,0);
 const failed=startDiscovery('acme-co',{platform:'instagram',seed:'demo_seed',nicheId:'tools'},async()=>{throw Error('Usage unavailable');});await new Promise(resolve=>setImmediate(resolve));assert.equal(readDiscoveries('acme-co').find(r=>r.id===failed.id)?.status,'failed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

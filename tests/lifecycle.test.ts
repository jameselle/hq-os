import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validLifecycle,lifecycleState,runLifecycle,localLifecycleOrigin} from '../lib/lifecycle';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('empty lifecycle remains disconnected evidence, not fabricated activity',()=>{
  const value={version:1,observedAt:null,paused:false,collectionFailed:false,stages:[],delivery:[],history:[],workflows:[],accounts:[]};
  assert.equal(validLifecycle(value),true);
  assert.equal(validLifecycle({...value,observedAt:'invalid'}),false);
  assert.equal(validLifecycle({...value,stages:[{label:'active',count:-1}]}),false);
  assert.equal(validLifecycle({...value,accounts:[{email:'private@example.com'}]}),false);
});
test('loopback mutations bind origin to the actual Host header',()=>{
 assert.equal(localLifecycleOrigin('http://127.0.0.1:3150','127.0.0.1:3150'),true);
 assert.equal(localLifecycleOrigin('http://localhost:3150','localhost:3150'),true);
 assert.equal(localLifecycleOrigin('https://evil.example','127.0.0.1:3150'),false);
 assert.equal(localLifecycleOrigin('http://127.0.0.1:9999','127.0.0.1:3150'),false);
 assert.equal(localLifecycleOrigin(null,'127.0.0.1:3150'),false);
});
test('private adapters isolate businesses and strip extra payload fields',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hq-lifecycle-')),old=process.env.HQ_DATA;process.env.HQ_DATA=dir;
 try{
  for(const slug of ['first','second']){
   fs.mkdirSync(path.join(dir,'businesses',slug),{recursive:true});
   fs.writeFileSync(path.join(dir,'businesses',slug,'profile.json'),JSON.stringify({slug,name:slug,country:'AU',currency:'AUD',timezone:'Australia/Sydney',offer:'Example',audience:'Example',model:'services',sites:[],channels:{},regulated:[],vault:{path:'vault'},createdAt:'2026-01-01'}));
  }
  const snapshot={version:1,observedAt:new Date().toISOString(),paused:false,collectionFailed:false,stages:[],delivery:[],history:[],workflows:[],accounts:[],privateValue:'must-not-persist'};
  fs.writeFileSync(path.join(dir,'businesses','first','lifecycle-connection.json'),JSON.stringify({command:[process.execPath,'-e',`process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(snapshot))}))`]}));
  const result=await runLifecycle('first','report');assert.equal(result.connected,true);assert.equal(result.stale,false);
  assert.equal(fs.readFileSync(path.join(dir,'businesses','first','lifecycle-snapshot.json'),'utf8').includes('must-not-persist'),false);
  assert.equal(lifecycleState('second').snapshot,null);assert.equal(lifecycleState('second').connected,false);
  assert.throws(()=>lifecycleState('../first'));
  const connection=path.join(dir,'businesses','first','lifecycle-connection.json');
  fs.writeFileSync(connection,JSON.stringify({...JSON.parse(fs.readFileSync(connection,'utf8')),readOnly:true}));
  assert.equal((await runLifecycle('first','report')).readOnly,true);
  await assert.rejects(runLifecycle('first','resume'),/Read-only/);
  await assert.rejects(runLifecycle('first','pause'),/Read-only/);
 }finally{if(old===undefined)delete process.env.HQ_DATA;else process.env.HQ_DATA=old;fs.rmSync(dir,{recursive:true,force:true});}
});
test('reads only answer requests addressed to this Mac (no DNS rebinding)',async()=>{
 const {localHost}=await import('../lib/lifecycle');
 assert.equal(localHost('127.0.0.1:3150'),true);
 assert.equal(localHost('localhost:3150'),true);
 assert.equal(localHost('localhost'),true);
 assert.equal(localHost('evil.example:3150'),false);
 assert.equal(localHost('127.0.0.1.evil.example:3150'),false);
 assert.equal(localHost(null),false);
});
test('approve and test reach the adapter with what the owner saw; read-only refuses them',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hq-lifecycle-')),old=process.env.HQ_DATA;process.env.HQ_DATA=dir;
 try{
  const b=path.join(dir,'businesses','first');fs.mkdirSync(b,{recursive:true});
  fs.writeFileSync(path.join(b,'profile.json'),JSON.stringify({slug:'first',name:'first',country:'AU',currency:'AUD',timezone:'Australia/Sydney',offer:'Example',audience:'Example',model:'services',sites:[],channels:{},regulated:[],vault:{path:'vault'},createdAt:'2026-01-01'}));
  // The adapter echoes the request it got into the workflow audience so the test can read it back.
  const echo=`let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>console.log(JSON.stringify({version:1,observedAt:new Date().toISOString(),paused:false,collectionFailed:false,stages:[],delivery:[],history:[],accounts:[],
    workflows:[{id:'d0',label:'Day 0',delayHours:1,enabled:true,audience:i,serves:'Onboarding to first value',sent30d:2,lastSentAt:'2026-10-05T00:00:00.000Z',drafts:3,preview:{subject:'Hello',text:'Body'},extra:'drop me'}]})))`;
  fs.writeFileSync(path.join(b,'lifecycle-connection.json'),JSON.stringify({command:[process.execPath,'-e',echo]}));
  const seen='2026-10-04T05:00:00.000Z';
  const r=await runLifecycle('first','approve',{workflow:'d0',before:seen});
  const w=r.snapshot!.workflows[0];
  assert.deepEqual(JSON.parse(w.audience),{action:'approve',workflow:'d0',before:seen});
  assert.equal(w.serves,'Onboarding to first value');assert.equal(w.sent30d,2);assert.equal(w.drafts,3);assert.deepEqual(w.preview,{subject:'Hello',text:'Body'});
  assert.equal(JSON.stringify(r.snapshot).includes('drop me'),false);
  assert.deepEqual(JSON.parse((await runLifecycle('first','test',{workflow:'d0'})).snapshot!.workflows[0].audience),{action:'test',workflow:'d0'});
  await assert.rejects(runLifecycle('first','approve',{workflow:'d0'}),/snapshot time/);
  await assert.rejects(runLifecycle('first','test',{}),/Choose a workflow/);
  fs.writeFileSync(path.join(b,'lifecycle-connection.json'),JSON.stringify({readOnly:true,command:[process.execPath,'-e',echo]}));
  await assert.rejects(runLifecycle('first','approve',{workflow:'d0',before:seen}),/Read-only/);
  await assert.rejects(runLifecycle('first','test',{workflow:'d0'}),/Read-only/);
 }finally{if(old===undefined)delete process.env.HQ_DATA;else process.env.HQ_DATA=old;fs.rmSync(dir,{recursive:true,force:true});}
});
test('optional workflow proof fields are validated, not trusted',()=>{
 const base={version:1,observedAt:null,paused:false,collectionFailed:false,stages:[],delivery:[],history:[],accounts:[]};
 const w={id:'a',label:'A',delayHours:0,enabled:true,audience:'x'};
 assert.equal(validLifecycle({...base,workflows:[w]}),true);
 assert.equal(validLifecycle({...base,workflows:[{...w,sent30d:-1}]}),false);
 assert.equal(validLifecycle({...base,workflows:[{...w,lastSentAt:'yesterday'}]}),false);
 assert.equal(validLifecycle({...base,workflows:[{...w,preview:{subject:'s',text:'x'.repeat(4001)}}]}),false);
 assert.equal(validLifecycle({...base,workflows:[{...w,serves:42}]}),false);
});
test('lifecycle flows: analytics are validated and rebuilt; html is bounded',()=>{
 const base={version:1,observedAt:null,paused:false,collectionFailed:false,stages:[],delivery:[],history:[],workflows:[],accounts:[]};
 const flow={id:'churn',label:'Churn check-ins',serves:'Churn early warning',mode:'draft',holdoutPct:20,channel:'email',trigger:'Paying members who went quiet',
  daily:[{day:'2026-10-05',entered:3,sent:2,skipped:1}],delivery:[{label:'sent',count:2}],skips:[{label:'came back',count:1}],
  outcomes:[{label:'Still paying',window:'30 days',emailed:{n:10,hit:9},holdout:{n:3,hit:2}}],messages:[{id:'churn-quiet',label:'Gone quiet',subject:'Quick question',html:'<p>x</p>'}]};
 assert.equal(validLifecycle({...base,flows:[flow]}),true);
 assert.equal(validLifecycle({...base,flows:[{...flow,mode:'yolo'}]}),false);
 assert.equal(validLifecycle({...base,flows:[{...flow,outcomes:[{...flow.outcomes[0],emailed:{n:1,hit:2}}]}]}),false,'hits cannot exceed n');
 assert.equal(validLifecycle({...base,flows:[{...flow,messages:[{...flow.messages[0],html:'x'.repeat(80001)}]}]}),false);
 assert.equal(validLifecycle({...base,flows:[{...flow,daily:[{day:'yesterday',entered:1,sent:1,skipped:0}]}]}),false);
});
test('mode action needs a flow and a known mode',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hq-lifecycle-')),old=process.env.HQ_DATA;process.env.HQ_DATA=dir;
 try{
  const b=path.join(dir,'businesses','first');fs.mkdirSync(b,{recursive:true});
  fs.writeFileSync(path.join(b,'profile.json'),JSON.stringify({slug:'first',name:'first',country:'AU',currency:'AUD',timezone:'Australia/Sydney',offer:'Example',audience:'Example',model:'services',sites:[],channels:{},regulated:[],vault:{path:'vault'},createdAt:'2026-01-01'}));
  const echo=`let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>console.log(JSON.stringify({version:1,observedAt:new Date().toISOString(),paused:false,collectionFailed:false,stages:[],delivery:[],history:[],accounts:[],workflows:[{id:'w',label:'W',delayHours:0,enabled:true,audience:i}]})))`;
  fs.writeFileSync(path.join(b,'lifecycle-connection.json'),JSON.stringify({command:[process.execPath,'-e',echo]}));
  assert.deepEqual(JSON.parse((await runLifecycle('first','mode',{workflow:'churn',mode:'auto'})).snapshot!.workflows[0].audience),{action:'mode',workflow:'churn',mode:'auto'});
  await assert.rejects(runLifecycle('first','mode',{workflow:'churn',mode:'yolo'}),/Mode must be/);
  await assert.rejects(runLifecycle('first','mode',{mode:'auto'}),/Choose a flow/);
 }finally{if(old===undefined)delete process.env.HQ_DATA;else process.env.HQ_DATA=old;fs.rmSync(dir,{recursive:true,force:true});}
});

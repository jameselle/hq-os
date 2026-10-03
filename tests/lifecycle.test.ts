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

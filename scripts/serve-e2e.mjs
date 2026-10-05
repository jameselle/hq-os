import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

// Isolated synthetic state: never connects to a real lifecycle adapter.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hq-browser-test-'));
for(const slug of ['sample-one','sample-two']){
 const dir=path.join(root,'businesses',slug,'brand');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'..','profile.json'),JSON.stringify({slug,name:slug,country:'AU',currency:'AUD',timezone:'Australia/Sydney',offer:'Demo',audience:'Demo',model:'services',sites:[],channels:{},regulated:[],vault:{path:'vault'},createdAt:'2026-01-01'}));
 if(slug==='sample-two')continue;
 fs.writeFileSync(path.join(dir,'mark.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');
 fs.writeFileSync(path.join(dir,'welcome.html'),'<p>synthetic download</p>');
 fs.writeFileSync(path.join(dir,'review.md'),'# Synthetic review');
 fs.writeFileSync(path.join(dir,'kit.json'),JSON.stringify({version:1,updatedAt:'2026-01-01',status:'Synthetic',guide:'Synthetic guidelines',colors:[{name:'Ink',hex:'#112233',use:'Text'}],assets:[{file:'mark.svg',label:'Mark'},{file:'welcome.html',label:'Welcome HTML'},{file:'review.md',label:'Review'}],emails:[{id:'welcome',label:'Synthetic welcome',subject:'Hello',sender:'Demo',trigger:'Never sent',status:'Draft',text:'Synthetic plain text',html:'<h1>Synthetic welcome</h1><script>parent.__previewExecuted=true</script>',source:'Synthetic fixture'}]}));
}
// Lifecycle: the template adapter's invented data, read once so the pages have a snapshot to show.
{
 const biz=path.join(root,'businesses','sample-one'),adapter=path.resolve('templates/lifecycle/lifecycle-template.mjs'),state=path.join(root,'lifecycle-state.json');
 fs.writeFileSync(path.join(biz,'lifecycle-connection.json'),JSON.stringify({command:[process.execPath,adapter,state]}));
 const out=spawnSync(process.execPath,[adapter,state],{input:'{"action":"report"}',encoding:'utf8'});
 if(out.status!==0)throw Error('template lifecycle adapter failed: '+out.stderr);
 fs.writeFileSync(path.join(biz,'lifecycle-snapshot.json'),out.stdout,{mode:0o600});
}
fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({current:'sample-one'}));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3169'],{stdio:'inherit',env:{...process.env,HQ_DATA:root}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{fs.rmSync(root,{recursive:true,force:true});process.exit(code??0);});

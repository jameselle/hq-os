import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validBrand,assetName,readBrand,brandAsset} from '../lib/brand';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('brand kits validate bounded per-business assets and templates',()=>{
 const kit={version:1,updatedAt:'2026-10-01',status:'Draft',guide:'Guide',colors:[{name:'Ink',hex:'#112233',use:'Text'}],assets:[{file:'mark.svg',label:'Mark'}],emails:[{id:'welcome',label:'Welcome',subject:'Welcome',sender:'Configured sender',trigger:'Signup',status:'Draft',text:'Hello',source:'Template'}]};
 assert.equal(validBrand(kit),true);
 assert.equal(validBrand({...kit,emails:[...kit.emails,...kit.emails]}),false);
 assert.equal(validBrand({...kit,colors:[{name:'bad',hex:'url(remote)',use:''}]}),false);
 assert.equal(validBrand({...kit,assets:[{file:'../secret.json',label:'No'}]}),false);
 for(const file of ['../x.svg','x/mark.svg','secret.env','x".svg'])assert.equal(assetName(file),false);
});
test('private assets stay within the selected business and reject symlink escapes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hq-brand-')),old=process.env.HQ_DATA;process.env.HQ_DATA=root;
 try{
  for(const slug of ['first','second']){
   const dir=path.join(root,'businesses',slug);fs.mkdirSync(path.join(dir,'brand'),{recursive:true});
   fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify({slug,name:slug,country:'AU',currency:'AUD',timezone:'Australia/Sydney',offer:'Example',audience:'Example',model:'services',sites:[],channels:{},regulated:[],vault:{path:'vault'},createdAt:'2026-01-01'}));
  }
  const dir=path.join(root,'businesses','first','brand');
  fs.writeFileSync(path.join(dir,'kit.json'),JSON.stringify({version:1,updatedAt:'2026-10-01',status:'Draft',guide:'Private guide',colors:[],assets:[{file:'mark.svg',label:'Mark'},{file:'outside.md',label:'No'}],emails:[]}));
  fs.writeFileSync(path.join(dir,'mark.svg'),'<svg/>');fs.writeFileSync(path.join(root,'outside.md'),'Private');fs.symlinkSync(path.join(root,'outside.md'),path.join(dir,'outside.md'));
  assert.equal(readBrand('first')?.guide,'Private guide');assert.equal(readBrand('second'),null);
  assert.equal(brandAsset('first','mark.svg')?.toString(),'<svg/>');
  assert.equal(brandAsset('second','mark.svg'),null);assert.equal(brandAsset('first','outside.md'),null);assert.equal(brandAsset('first','../profile.json'),null);
 }finally{if(old===undefined)delete process.env.HQ_DATA;else process.env.HQ_DATA=old;fs.rmSync(root,{recursive:true,force:true});}
});

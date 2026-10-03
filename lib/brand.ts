import fs from 'node:fs';
import path from 'node:path';
import {businessDir,getProfile} from './store';

export type BrandKit={version:1;updatedAt:string;status:string;guide:string;colors:{name:string;hex:string;use:string}[];assets:{file:string;label:string}[];emails:{id:string;label:string;subject:string;sender:string;trigger:string;status:string;text:string;html?:string;source:string}[]};
const text=(v:unknown,max=1000):v is string=>typeof v==='string'&&v.length<=max;
export const assetName=(v:string)=>/^[a-z0-9][a-z0-9._-]*\.(svg|png|html|json|md)$/.test(v);
export function validBrand(v:unknown):v is BrandKit{
  const x=v as BrandKit;
  return Boolean(x&&x.version===1&&text(x.updatedAt)&&text(x.status)&&text(x.guide,40000)
    &&Array.isArray(x.colors)&&x.colors.length<=20&&x.colors.every(c=>text(c.name)&&/^#[a-f0-9]{6}$/i.test(c.hex)&&text(c.use))
    &&Array.isArray(x.assets)&&x.assets.length<=40&&x.assets.every(a=>text(a.file)&&assetName(a.file)&&text(a.label))
    &&Array.isArray(x.emails)&&x.emails.length<=30&&new Set(x.emails.map(e=>e.id)).size===x.emails.length&&x.emails.every(e=>text(e.id)&&text(e.label)&&text(e.subject)&&text(e.sender)&&text(e.trigger)&&text(e.status)&&text(e.text,40000)&&(e.html===undefined||text(e.html,100000))&&text(e.source)));
}
export function readBrand(slug:string):BrandKit|null{
  if(!getProfile(slug))return null;
  try{const file=path.join(businessDir(slug),'brand','kit.json');if(fs.statSync(file).size>2000000)return null;const v=JSON.parse(fs.readFileSync(file,'utf8'));return validBrand(v)?v:null;}catch{return null;}
}
export function brandAsset(slug:string,file:string){
  const kit=readBrand(slug);if(!assetName(file)||!kit?.assets.some(a=>a.file===file))return null;
  try{const dir=fs.realpathSync(path.join(businessDir(slug),'brand'));const target=fs.realpathSync(path.join(dir,file));if(path.dirname(target)!==dir||fs.statSync(target).size>10000000)return null;return fs.readFileSync(target);}catch{return null;}
}

import https from 'node:https';
import dns from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {accountHandle,type SocialPlatform} from './trends';
const blocked=new BlockList();
for(const [address,prefix] of [['0 0 0 0',8],['10 0 0 0',8],['100 64 0 0',10],['127 0 0 0',8],['169 254 0 0',16],['172 16 0 0',12],['192 168 0 0',16],['192 0 0 0',24],['192 0 2 0',24],['198 18 0 0',15],['198 51 100 0',24],['203 0 113 0',24],['224 0 0 0',4],['240 0 0 0',4]] as const)blocked.addSubnet(address.replaceAll(' ','.'),prefix,'ipv4');
export function publicAddress(address:string):boolean {const kind=isIP(address);return kind===4?!blocked.check(address,'ipv4'):kind===6&&/^2[0-9a-f]{3}:/i.test(address)&&!/^2001:(db8|0):/i.test(address);}
// Resolve and pin a public address for every hop; a research result cannot fetch local services.
export async function officialPage(raw:string,hops=0):Promise<string>{
 const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||isIP(url.hostname)||hops>3)throw Error('Public HTTPS website required');
 const addresses=await dns.lookup(url.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Non-public website');
 const address=addresses[0];
 return new Promise((resolve,reject)=>{
 const req=https.get(url,{headers:{'User-Agent':'HQ public competitor research'},family:4,signal:AbortSignal.timeout(12000),lookup:(_host,_options,cb)=>cb(null,address.address,address.family)},res=>{
  if(res.statusCode&&res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();officialPage(new URL(res.headers.location,url).toString(),hops+1).then(resolve,reject);return;}
  if(res.statusCode!==200||!String(res.headers['content-type']).includes('text/html')){res.resume();reject(Error('Website unavailable'));return;}
  let size=0;const chunks:Buffer[]=[];res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){req.destroy(Error('Website too large'));return;}chunks.push(chunk);});res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));res.on('error',reject);
 });req.setTimeout(10000,()=>req.destroy(Error('Website timed out')));req.on('error',reject);
 });
}
export function officialHandles(html:string,platform:SocialPlatform):string[]{
 const handles=new Set<string>();
 // Only actual hrefs, not embedded posts or guessed account names.
 for(const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi))try{
  const url=new URL(match[1].replace(/&amp;/g,'&'));if(url.protocol!=='https:')continue;
  handles.add(accountHandle(url.toString(),platform));
 }catch{}
 return [...handles].slice(0,3);
}

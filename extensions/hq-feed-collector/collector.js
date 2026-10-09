(()=>{
 if(globalThis.HQFeedController)return;globalThis.HQFeedController=true;
 let timer,config,panel,label,running=false,inFlight=false,empty=0,last='',unchanged=0;
 function display(message){if(label)label.textContent=message;}
 function end(message){running=false;clearTimeout(timer);display(message);}
 async function send(posts,stop=false,reason){return chrome.runtime.sendMessage({type:'HQ_BATCH',posts,stop,reason});}
 async function finish(reason){end(reason);try{await send([],true,reason);}catch{display(`${reason}. HQ connection unavailable.`);}}
 async function tick(){if(!running||inFlight)return;inFlight=true;try{
  if(Date.now()-Date.parse(config.startedAt)>=config.minutes*60000){await finish('Time limit reached');return;}
  if(!HQFeedExtractor.allowed(config.platform)){await finish('Left the supported feed page');return;}
  if(document.hidden){const r=await send([]);if(r.error)throw Error(r.error);if(r.stop){end(r.reason||'Stopped in HQ');return;}display('HQ collection paused — return to this tab');return;}
  if(HQFeedExtractor.prepare(config.platform)){display('Opening video view to read its post link…');return;}
  const posts=HQFeedExtractor.collect(config.platform),signature=posts.map(p=>p.url).join('|');empty=posts.length?0:empty+1;unchanged=signature&&signature===last?unchanged+1:0;last=signature;
  const result=await send(posts);if(!running)return;if(result.error)throw Error(result.error);display(`HQ · ${result.count} posts saved · Stop anytime`);
  if(result.stop){end(result.reason||'Collection complete');return;}
  if(empty>=5){await finish('No readable post links. Open Reels, Explore or For You and try again.');return;}
  if(unchanged>=5){await finish('Feed stopped advancing. Scroll manually and start a new session.');return;}
  HQFeedExtractor.advance(config.platform);
 }catch(e){end(`Stopped: ${e.message}`);try{await send([],true,'Connection lost; collector stopped');}catch{}}
 finally{inFlight=false;if(running)timer=setTimeout(tick,6000);}}
 chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
  if(message.type==='HQ_PING'){respond({running});return;}
  if(message.type==='HQ_STOP'){end('Stopped in HQ or extension');respond({ok:true});return;}
  if(message.type!=='HQ_BEGIN')return;
  if(!HQFeedExtractor.allowed(message.platform)){respond({error:'Open Instagram Reels/Explore or TikTok For You first'});return;}
  clearTimeout(timer);panel?.remove();config=message;empty=0;unchanged=0;last='';running=true;
  panel=document.createElement('aside');panel.setAttribute('aria-label','HQ feed collection');panel.style.cssText='position:fixed;right:24px;top:24px;z-index:2147483647;background:#101828;color:#f2f6ff;border:1px solid #32c5aa;border-radius:12px;padding:14px;max-width:300px;font:13px system-ui;box-shadow:0 8px 30px #0008';
  label=document.createElement('p');label.style.margin='0 0 10px';label.textContent='HQ collection starting…';panel.append(label);
  const stop=document.createElement('button');stop.textContent='Stop collection';stop.style.cssText='padding:7px 12px;background:#243448;border:0;color:white;border-radius:6px;cursor:pointer';stop.onclick=()=>finish('Stopped on feed');panel.append(stop);
  const close=document.createElement('button');close.textContent='Dismiss';close.style.cssText=stop.style.cssText+';margin-left:8px';close.onclick=()=>{if(running)finish('Stopped on feed');panel.remove();};panel.append(close);document.body.append(panel);respond({ok:true});tick();
 });
})();

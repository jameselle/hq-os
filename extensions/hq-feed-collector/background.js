const HQ='http://127.0.0.1:3150/api/feed-collector/bridge';
const platformFor=url=>{try{const u=new URL(url);if(u.protocol!=='https:')return null;return ['www.instagram.com','instagram.com'].includes(u.hostname)?'instagram':['www.tiktok.com','tiktok.com'].includes(u.hostname)?'tiktok':null;}catch{return null;}};
async function request(body,token){const r=await fetch(HQ,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const data=await r.json();if(!r.ok)throw Error(data.error||'HQ unavailable');return data;}
async function stop(reason){const {active}=await chrome.storage.session.get('active');if(!active)return;try{await chrome.tabs.sendMessage(active.tabId,{type:'HQ_STOP'});}catch{}try{await request({slug:active.slug,id:active.id,posts:[],stop:true,reason},active.token);}catch{}await chrome.storage.session.remove('active');await chrome.action.setBadgeText({text:''});}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 (async()=>{
  if(sender.id!==chrome.runtime.id)throw Error('Invalid sender');
  if(msg.type==='HQ_START'&&!sender.tab){
   const {active}=await chrome.storage.session.get('active');if(active)throw Error('Stop the current collection first');
   const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const platform=platformFor(tab?.url);if(!platform)throw Error('Open your Instagram Reels/Explore or TikTok For You feed first');
   const session=await request({action:'connect',slug:msg.slug,id:msg.id,platform});const config={...session,tabId:tab.id};await chrome.storage.session.set({active:config});
   try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractor.js','collector.js']});const result=await chrome.tabs.sendMessage(tab.id,{type:'HQ_BEGIN',platform,minutes:session.minutes,startedAt:session.startedAt});if(result?.error)throw Error(result.error);}catch(e){await stop('Could not start on this page');throw e;}
   await chrome.action.setBadgeText({text:'ON'});await chrome.action.setBadgeBackgroundColor({color:'#158a76'});return {ok:true};
  }
  if(msg.type==='HQ_PENDING'&&!sender.tab){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const platform=platformFor(tab?.url);if(!platform)throw Error('Open Instagram Explore or TikTok For You first');return request({action:'pending',platform});}
  if(msg.type==='HQ_STATUS'&&!sender.tab){const {active}=await chrome.storage.session.get('active');return {active:!!active};}
  if(msg.type==='HQ_STOP'&&!sender.tab){await stop('Stopped in extension');return {ok:true};}
  const {active}=await chrome.storage.session.get('active');if(!active||sender.tab?.id!==active.tabId||sender.frameId!==0||platformFor(sender.url)!==active.platform)throw Error('No authorised feed session');
  if(msg.type!=='HQ_BATCH')throw Error('Unknown message');
  let result;try{result=await request({slug:active.slug,id:active.id,posts:msg.posts,stop:msg.stop===true,reason:msg.reason},active.token);}catch(e){await chrome.storage.session.remove('active');await chrome.action.setBadgeText({text:''});throw e;}
  if(result.stop){await chrome.storage.session.remove('active');await chrome.action.setBadgeText({text:''});}return result;
 })().then(respond,e=>respond({error:e.message}));return true;
});
chrome.tabs.onRemoved.addListener(async id=>{const {active}=await chrome.storage.session.get('active');if(active?.tabId===id)await stop('Feed tab closed');});
chrome.tabs.onUpdated.addListener(async(id,change)=>{const {active}=await chrome.storage.session.get('active');if(active?.tabId!==id)return;if(change.url&&platformFor(change.url)!==active.platform){await stop('Left the feed platform');return;}if(change.status==='complete'){try{const response=await chrome.tabs.sendMessage(id,{type:'HQ_PING'});if(!response?.running)await stop('Feed page reloaded or collection ended');}catch{await stop('Feed page reloaded');}}});

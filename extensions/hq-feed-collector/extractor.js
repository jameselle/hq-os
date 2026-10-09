/* Reads rendered feed cards only. No network, cookies, page state or private APIs. */
(()=>{
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&getComputedStyle(e).visibility!=='hidden';};
 const text=e=>(e?.innerText||'').trim();
 function postURL(value,platform){try{const u=new URL(value,location.origin);if(u.protocol!=='https:')return null;if(platform==='instagram'&&['instagram.com','www.instagram.com'].includes(u.hostname)){const m=u.pathname.match(/^\/(?:[\w.]+\/)?(reel|reels|p)\/([\w-]{5,40})\/?$/);if(m)return `https://www.instagram.com/${m[1]==='p'?'p':'reel'}/${m[2]}/`;}if(platform==='tiktok'&&['tiktok.com','www.tiktok.com'].includes(u.hostname)&&/^\/@[\w.]+\/video\/\d{10,30}\/?$/.test(u.pathname))return `https://www.tiktok.com${u.pathname}`;}catch{}return null;}
 function allowed(platform){return platform==='instagram'?/^\/(?:reels?|explore)(?:\/|$)/.test(location.pathname):(/^\/(?:foryou\/?)?$/.test(location.pathname)||(/^\/@[\w.]+\/video\/\d+\/?$/.test(location.pathname)&&!!document.querySelector('[role="dialog"][aria-label="Cinema mode"]')));}
 function cardFor(video){let card=video.parentElement;for(let i=0;card&&i<25;i++,card=card.parentElement){if(card.tagName==='MAIN')break;if(card.querySelector('a[href]')&&card.querySelector('[aria-label="Like"], [data-e2e="like-count"], [data-e2e="browse-like-count"]'))return card;}return null;}
 function fromCard(card,url,platform){
  const anchors=Array.from(card.querySelectorAll('a[href]'));let handle='';
  if(platform==='instagram'){for(const a of anchors){const m=new URL(a.href,location.origin).pathname.match(/^\/([\w.]+)\/(?:reels\/)?$/);if(m&&!['reels','explore','direct','accounts','stories'].includes(m[1])){handle=m[1];break;}}}else handle=url.match(/\/@([^/]+)/)?.[1]||'';
  const metrics={};for(const key of ['views','likes','comments']){const singular=key==='views'?'view':key==='likes'?'like':'comment';const e=card.querySelector(`[data-e2e="${singular}-count"], [data-e2e="browse-${singular}-count"]`);if(e&&visible(e)&&/\d/.test(text(e)))metrics[key]=text(e).slice(0,50);}
  const buttons=Array.from(card.querySelectorAll('button,[role="button"]')).filter(visible);
  if(platform==='instagram'){
   const comment=buttons.find(e=>/^Comment\s+\d/i.test(e.getAttribute('aria-label')||'')||e.querySelector('[aria-label="Comment"]'));
   const commentText=comment&&(comment.getAttribute('aria-label')||text(comment));if(commentText&&/\d/.test(commentText))metrics.comments=commentText.replace(/^Comment\s*/i,'').slice(0,50);
   const like=buttons.find(e=>e.getAttribute('aria-label')==='Like'||e.querySelector('[aria-label="Like"]'));
   if(like){const i=buttons.indexOf(like);const next=buttons[i+1];if(next&&/^[\d.,]+\s*[KMB]?$/i.test(text(next)))metrics.likes=text(next);}
  }
  const desc=Array.from(card.querySelectorAll('[data-e2e="video-desc"], [data-e2e="browse-video-desc"], h1')).find(visible);
  const caption=desc&&visible(desc)?text(desc):buttons.map(text).filter(t=>t.length>25&&!/^(Follow|Learn more|Sponsored)/.test(t)).sort((a,b)=>b.length-a.length)[0]||'';
  return {url,handle,caption:caption.slice(0,2000),visible:metrics};
 }
 function collect(platform){
  if(!allowed(platform))return [];if(platform==='tiktok'){const cinema=document.querySelector('[role="dialog"][aria-label="Cinema mode"]'),url=postURL(location.href,platform);if(cinema&&url)return [fromCard(cinema,url,platform)];}const main=document.querySelector('main')||document.querySelector('[role="main"]');if(!main)return [];const posts=new Map();
  const videos=Array.from(main.querySelectorAll('video')).filter(visible).sort((a,b)=>Math.abs(a.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top));
  for(const video of videos){const card=cardFor(video);if(!card)continue;let url=Array.from(card.querySelectorAll('a[href]')).map(a=>postURL(a.href,platform)).find(Boolean);if(!url&&platform==='instagram'&&video===videos[0])url=postURL(location.href,platform);if(url)posts.set(url,fromCard(card,url,platform));}
  // Explore tiles and TikTok cards expose direct permalinks; only collect visible tiles.
  for(const a of main.querySelectorAll('a[href]')){if(!visible(a))continue;const url=postURL(a.href,platform);if(!url||posts.has(url))continue;const card=a.closest('article,[data-e2e="recommend-list-item-container"]')||a;posts.set(url,fromCard(card,url,platform));}
  return [...posts.values()].slice(0,10);
 }
 function prepare(platform){if(platform!=='tiktok'||document.querySelector('[role="dialog"][aria-label="Cinema mode"]'))return false;const entry=Array.from(document.querySelectorAll('main [data-e2e="cinema-mode-entry"]')).find(visible);if(entry){entry.click();return true;}return false;}
 function advance(platform){if(platform==='tiktok'){const next=document.querySelector('[role="dialog"][aria-label="Cinema mode"] button[aria-label="Next video"]');if(next&&visible(next)&&!next.disabled){next.click();return;}}if(platform==='instagram'){const next=document.querySelector('button[aria-label="Navigate to next reel"]');if(next&&visible(next)){next.click();return;}}
  const main=document.querySelector('main')||document.querySelector('[role="main"]');const video=main&&Array.from(main.querySelectorAll('video')).find(visible);let el=video?.parentElement||main;while(el&&el!==document.body){if(el.scrollHeight>el.clientHeight+100&&/(auto|scroll)/.test(getComputedStyle(el).overflowY)){el.scrollBy({top:Math.max(400,el.clientHeight),behavior:'smooth'});return;}el=el.parentElement;}window.scrollBy({top:Math.max(500,innerHeight*0.85),behavior:'smooth'});
 }
 globalThis.HQFeedExtractor={collect,advance,prepare,allowed,postURL};
})();

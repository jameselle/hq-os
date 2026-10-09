import {collectEnabled,collectTrends,readNiches,saveNiches} from '../lib/trend-store';
import {discoverDue} from '../lib/trend-automation';
import {refreshAllFeeds} from '../lib/feed-collector';
async function main(){
 const slug=process.argv[2];
 if(slug==='--all'){await collectEnabled();await refreshAllFeeds();return discoverDue();}
 if(!slug)throw Error('Usage: npm run trends -- <business-slug|--all>');
 saveNiches(slug,readNiches(slug));
 console.log(JSON.stringify(await collectTrends(slug,{force:true}),null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

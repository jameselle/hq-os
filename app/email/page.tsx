import Link from 'next/link';
import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {lifecycleState} from '@/lib/lifecycle';
import {readBrand} from '@/lib/brand';
import {EMAIL_TABS,emailTab} from '@/lib/email-navigation';
import {LifecyclePanel} from '@/components/LifecyclePanel';
import {BrandPanel} from '@/components/BrandPanel';
import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';
const labels={overview:'Overview',workflows:'Workflows',previews:'Email Previews',delivery:'Delivery',accounts:'Accounts',tools:'Tools & Skills'};
export default async function EmailPage({searchParams:query}:{searchParams:Promise<{tab?:string;preview?:string}>}){
 const searchParams=await query;
 const p=resolveCurrent(await preferredBusiness());
 const tab=emailTab(searchParams.tab);
 return <div className="space-y-6 min-w-0">
  <header><h1 className="text-2xl font-semibold">Email & Lifecycle</h1><p className="text-sm text-bb-muted mt-1">{p?.name||'Choose a business'}</p></header>
  <nav aria-label="Email and lifecycle views" className="flex gap-1 overflow-x-auto border-b border-bb-border pb-px">{EMAIL_TABS.map(t=><Link key={t} href={`/email?tab=${t}`} aria-current={tab===t?'page':undefined} className={`shrink-0 px-4 py-3 text-sm border-b-2 ${tab===t?'border-bb-teal text-bb-fg':'border-transparent text-bb-muted hover:text-bb-fg'}`}>{labels[t]}</Link>)}</nav>
  {tab==='tools'?<DepartmentPage params={{dept:'email'}} embedded/>:tab==='previews'?<BrandPanel key={`${p?.slug}:${searchParams.preview}`} initialEmail={searchParams.preview} emailsOnly kit={p?readBrand(p.slug):null}/>:<LifecyclePanel key={p?.slug||'none'} view={tab} initial={{business:p?.name||null,...(p?lifecycleState(p.slug):{connected:false,snapshot:null,stale:true})}}/>}
 </div>;
}

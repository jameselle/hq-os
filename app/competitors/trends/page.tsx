import {preferredBusiness} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {radar} from '@/lib/trend-store';
import TrendRadar from '@/components/TrendRadar';
export const dynamic='force-dynamic';
export default async function Page(){
 const business=resolveCurrent(await preferredBusiness());
 return business?<TrendRadar key={business.slug} business={business.name} initial={radar(business.slug)}/>:<p>Choose a business to open Trend Radar.</p>;
}

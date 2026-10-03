import {redirect} from 'next/navigation';
import {legacyLifecycleUrl} from '@/lib/email-navigation';
export default async function LifecyclePage({searchParams:query}:{searchParams:Promise<{preview?:string}>}){
  const searchParams=await query;
  redirect(legacyLifecycleUrl(searchParams.preview));
}

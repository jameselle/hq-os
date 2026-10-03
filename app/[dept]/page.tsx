import DepartmentPage from '@/components/DepartmentPage';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{dept:string}>}){return <DepartmentPage params={await params}/>;}

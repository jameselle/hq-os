import {NextRequest,NextResponse} from 'next/server';
import {localHost,localLifecycleOrigin} from '@/lib/lifecycle';
import {BUSINESS_COOKIE} from '@/lib/current';
import {resolveCurrent} from '@/lib/store';
import {createFeedSession,feedView,stopFeed,watchFeedAccount,refreshFeed} from '@/lib/feed-collector';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){if(!localHost(req.headers.get('host')))return reply({error:'Local request required'},403);const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);if(!p)return reply({error:'Choose a business'},400);return reply(feedView(p.slug));}
export async function POST(req:NextRequest){if(!localLifecycleOrigin(req.headers.get('origin'),req.headers.get('host')))return reply({error:'Local same-origin request required'},403);const p=resolveCurrent(req.cookies.get(BUSINESS_COOKIE)?.value);if(!p)return reply({error:'Choose a business'},400);const body=await req.json().catch(()=>null);try{let created;if(body?.action==='create')created={sessionId:createFeedSession(p.slug,body).sessionId};else if(body?.action==='stop')stopFeed(p.slug,body.id);else if(body?.action==='watch')watchFeedAccount(p.slug,body.id);else if(body?.action==='verify')await refreshFeed(p.slug);else throw Error('Unknown action');return reply({...feedView(p.slug),...created});}catch(e){return reply({error:e instanceof Error?e.message:'Feed request failed'},409);}}

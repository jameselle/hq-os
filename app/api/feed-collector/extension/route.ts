import {NextRequest,NextResponse} from 'next/server';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {localHost} from '@/lib/lifecycle';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){if(!localHost(req.headers.get('host')))return new NextResponse('Local request required',{status:403});try{const bytes=await new Promise<Buffer>((resolve,reject)=>execFile('/usr/bin/zip',['-q','-r','-','manifest.json','background.js','extractor.js','collector.js','popup.html','popup.js'],{cwd:path.join(process.cwd(),'extensions/hq-feed-collector'),encoding:'buffer',timeout:10000,maxBuffer:2*1024*1024},(e,out)=>e?reject(e):resolve(out)));return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="hq-feed-collector.zip"','Cache-Control':'no-store'}});}catch{return new NextResponse('Extension package unavailable',{status:503});}}

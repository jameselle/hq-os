// Automatic posting's pure parts: which posts are due, whether another attempt may run, and the exact Python HQ
// hands the Composio workbench for each post. No I/O: lib/social-publisher.ts runs it.
//
// Why the Composio workbench, run by Claude Code headless: the accounts HQ posts through are connected in the
// owner's claude.ai Composio connector, which only a Claude session can reach (there is no stored Composio key
// for HQ to call the REST API with, and HQ never reads .env files). So HQ writes the code itself, and the headless
// run's only job is to pass it to COMPOSIO_REMOTE_WORKBENCH unchanged: every cell checks a sha256 of its payload,
// so a copy that isn't exact refuses to run. HQ reads the cells' printed results straight from the run's
// stream-json tool results, never from the model's own words.
//
// Images: the platforms need a URL they can fetch. HQ asks the workbench for presigned upload slots in Composio's
// own file store, uploads the JPEGs from the Mac, checks each one downloads byte for byte, and the workbench hands
// them to the platform tool by s3key (Instagram) or as base64 bytes (Pinterest). Nothing goes on a website or a
// public host, and the store's links are unguessable and short-lived.
//
// Never twice: every attempt is written to the draft before the first call, and every cell run starts by looking
// for the post on the account (same caption, or for pins the same title, since a few days before its day). If
// it's there, HQ records that link instead of posting again.
import crypto from "node:crypto";

import { autoPostProblem, decideSocial, type SocialConfig, type SocialDraft } from "./social";

export const MAX_ATTEMPTS = 3;
/** The business's own limit (social.json maxAttempts), else MAX_ATTEMPTS. Never retried forever. */
export const attemptsAllowed = (c: SocialConfig) => c.maxAttempts ?? MAX_ATTEMPTS;
/** Minutes between attempts (com.hq.social runs hourly, so in practice the next hour). */
export const RETRY_GAP_MIN = 45;
/** Days late HQ still posts a post (the Mac was asleep). Older ones are left for the owner. */
export const MAX_DAYS_LATE = 2;
/** How far before its day a matching post counts as this post (the owner may have posted it early by hand). */
export const LOOKBACK_DAYS = 3;

/** YYYY-MM-DD and the hour, in a timezone. */
export function localDay(now: Date, tz: string): { day: string; hour: number } {
  const day = now.toLocaleDateString("en-CA", { timeZone: tz });
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(now));
  return { day, hour };
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export type DueCheck = { due: boolean; why: string };

/** Whether HQ should put this post out now. */
export function dueNow(c: SocialConfig, d: SocialDraft, now: Date, tz: string): DueCheck {
  const decision = decideSocial(c, d, now);
  if (decision !== "publish") return { due: false, why: decision === "hand" && autoPostProblem(d) ? `by hand: ${autoPostProblem(d)}` : decision };
  const { day, hour } = localDay(now, tz);
  if (d.day > day) return { due: false, why: `due ${d.day}` };
  if (d.day === day && hour < (c.postHour ?? 9)) return { due: false, why: `due today from ${c.postHour ?? 9}:00` };
  if (daysBetween(d.day, day) > MAX_DAYS_LATE) return { due: false, why: `${daysBetween(d.day, day)} days late: post it by hand or move its day` };
  const tries = d.attempts ?? [], max = attemptsAllowed(c);
  if (tries.length >= max) return { due: false, why: `tried ${tries.length} times` };
  const last = tries.at(-1);
  if (last && now.getTime() - Date.parse(last.at) < RETRY_GAP_MIN * 60e3) return { due: false, why: `tried at ${last.at.slice(11, 16)}Z, retrying later` };
  return { due: true, why: tries.length ? `retry ${tries.length + 1} of ${max}` : "due" };
}

/** The caption exactly as it goes out: the text, then the hashtags. */
export function fullCaption(d: SocialDraft): string {
  return `${d.caption}${d.hashtags.length ? `\n\n${d.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : ""}`;
}

/** Words for screen readers, from the cards. */
export function altText(d: SocialDraft, max: number): string {
  const t = (d.slides ?? []).map((s) => [s.title, s.body].filter(Boolean).join(". ")).join(" ") || d.title || d.caption;
  return t.replace(/\s+/g, " ").trim().slice(0, max);
}

export type Payload = {
  run: string;
  network: "instagram" | "pinterest";
  format: string;
  account: string;
  /** The username the account must be, without @ (Instagram); a wrong account aborts before anything is made. */
  handle?: string;
  caption: string;
  title?: string;
  link?: string;
  alt?: string;
  board?: string;
  /** Composio file-store download links, one per image (or the one video). */
  media: { url: string; name: string; mimetype: string; sha256: string }[];
  /** Unix seconds: a post on the account at or after this with the same caption is this one. */
  since: number;
  /** "publish" puts it out; "container" (Instagram) makes the container and stops; "check" only looks. */
  mode: "publish" | "container" | "check";
  /** An earlier attempt exists (stories have no caption to match, so they're only looked for on a retry). */
  retry?: boolean;
};

export function newRun(): string { return crypto.randomBytes(6).toString("hex"); }

export function buildPayload(o: Omit<Payload, "since"> & { day: string }): Payload {
  const { day, ...rest } = o;
  return { ...rest, since: Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) - LOOKBACK_DAYS * 86400 };
}

/** A JSON payload as a Python string literal (JSON string escapes are valid Python), with its sha256. */
export function embed(p: unknown): { lit: string; sha: string } {
  const s = JSON.stringify(p);
  return { lit: JSON.stringify(s), sha: crypto.createHash("sha256").update(s, "utf8").digest("hex") };
}

export const HEAD = (lit: string, sha: string, run: string) => `import json,hashlib,os,time,base64,datetime,tempfile,requests
from concurrent.futures import ThreadPoolExecutor
_S=${lit}
_OK=hashlib.sha256(_S.encode()).hexdigest()=="${sha}"
P=json.loads(_S) if _OK else {"run":"${run}"}
_D=os.environ.get("HQ_SOCIAL_STATE","/mnt/files/hq_social")
_F=_D+"/"+P["run"]+".json"
def out(**k):
  k["run"]=P["run"]; os.makedirs(_D,exist_ok=True); json.dump(k,open(_F,"w")); print("HQ_RESULT "+json.dumps(k))
def last():
  try: return json.load(open(_F))
  except Exception: return {}
def dig(d,key):
  if isinstance(d,dict):
    if key in d and d[key] not in (None,"",[]): return d[key]
    for v in d.values():
      r=dig(v,key)
      if r not in (None,"",[]): return r
  if isinstance(d,list):
    for v in d:
      r=dig(v,key)
      if r not in (None,"",[]): return r
  return None
def items(d):
  for k in ("data","items"):
    if isinstance(d,dict) and isinstance(d.get(k),list): return d[k]
  if isinstance(d,dict):
    for k in ("data","response_data","results"):
      if isinstance(d.get(k),dict):
        r=items(d[k])
        if r: return r
  return []
def call(slug,args):
  r,e=run_composio_tool(slug,args,print_schema_for_tool=False,account=P["account"])
  if e: raise Exception(slug+": "+str(e)[:400])
  d=r.get("data",r) if isinstance(r,dict) else r
  err=dig(d,"error")
  if isinstance(err,dict) and (err.get("message") or err.get("code")): raise Exception(slug+": "+str(err)[:400])
  return d
def norm(t): return " ".join((t or "").split()).lower()
def ts(t):
  try: return datetime.datetime.strptime(t.replace("+0000","+00:00")[:25],"%Y-%m-%dT%H:%M:%S%z").timestamp()
  except Exception:
    try: return datetime.datetime.fromisoformat(t).replace(tzinfo=datetime.timezone.utc).timestamp()
    except Exception: return 0
def fetch(m):
  b=requests.get(m["url"],timeout=60,allow_redirects=True).content
  if hashlib.sha256(b).hexdigest()!=m["sha256"]: raise Exception("media "+m["name"]+" didn't download intact")
  return b
`;

/** Instagram, in three cells (each under the workbench's 3 minute limit): look, then containers, then publish. */
export function instagramCells(p: Payload): string[] {
  const { lit, sha } = embed(p);
  const head = HEAD(lit, sha, p.run);
  const a = `${head}
try:
  if not _OK: raise Exception("integrity: the payload was not copied exactly")
  me=call("INSTAGRAM_GET_USER_INFO",{"ig_user_id":"me","fields":"user_id,username"})
  if norm(dig(me,"username"))!=norm(P["handle"]): raise Exception("wrong account: "+str(dig(me,"username")))
  uid=str(dig(me,"user_id") or dig(me,"id"))
  want=norm(P["caption"])[:100]
  found=None
  if P["format"]=="story":
    if P.get("retry"):
      for it in items(call("INSTAGRAM_GET_IG_USER_STORIES",{"fields":"id,permalink,timestamp"})):
        if ts(it.get("timestamp",""))>=P["since"]: found=it
  else:
    for it in items(call("INSTAGRAM_GET_IG_USER_MEDIA",{"ig_user_id":"me","limit":30,"fields":"id,caption,timestamp,permalink"})):
      if want and norm(it.get("caption"))[:100]==want and ts(it.get("timestamp",""))>=P["since"]: found=it; break
  if found: out(status="found",id=str(found.get("id")),url=found.get("permalink") or "")
  elif P["mode"]=="check": out(status="checked",uid=uid)
  else:
    def up(m):
      b=fetch(m); f=os.path.join(tempfile.mkdtemp(),m["name"]); open(f,"wb").write(b)
      r,e=upload_local_file(f)
      if e or not r.get("s3key"): raise Exception("upload "+m["name"]+": "+str(e)[:200])
      return {"name":m["name"],"mimetype":m["mimetype"],"s3key":r["s3key"]}
    with ThreadPoolExecutor(4) as ex: files=list(ex.map(up,P["media"]))
    out(status="staged",uid=uid,files=files)
except Exception as e:
  out(status="error",stage="look",error=str(e)[:500])
`;
  const b = `${head}
s=last()
if not _OK: out(status="error",stage="integrity",error="integrity: the payload was not copied exactly")
elif s.get("status")!="staged": print("HQ_RESULT "+json.dumps(s))
else:
  try:
    uid,files=s["uid"],s["files"]
    def cid(d):
      c=dig(d,"id") or dig(d,"creation_id")
      if not c: raise Exception("no container id in "+json.dumps(d)[:300])
      return str(c)
    if P["format"]=="carousel":
      def child(f): return cid(call("INSTAGRAM_POST_IG_USER_MEDIA",{"ig_user_id":uid,"image_file":f,"is_carousel_item":True}))
      with ThreadPoolExecutor(5) as ex: kids=list(ex.map(child,files))
      c=cid(call("INSTAGRAM_CREATE_CAROUSEL_CONTAINER",{"ig_user_id":uid,"caption":P["caption"],"children":kids}))
    elif P["format"]=="story":
      c=cid(call("INSTAGRAM_POST_IG_USER_MEDIA",{"ig_user_id":uid,"image_file":files[0],"media_type":"STORIES"}))
    elif P["format"]=="reel":
      c=cid(call("INSTAGRAM_POST_IG_USER_MEDIA",{"ig_user_id":uid,"video_file":files[0],"media_type":"REELS","caption":P["caption"],"share_to_feed":True}))
    else:
      a={"ig_user_id":uid,"image_file":files[0],"caption":P["caption"]}
      if P.get("alt"): a["alt_text"]=P["alt"][:1000]
      c=cid(call("INSTAGRAM_POST_IG_USER_MEDIA",a))
    out(status="container",uid=uid,container=c)
  except Exception as e:
    out(status="error",stage="container",error=str(e)[:500])
`;
  const c = `${head}
s=last()
if not _OK: out(status="error",stage="integrity",error="integrity: the payload was not copied exactly")
elif s.get("status")!="container" or P["mode"]!="publish": print("HQ_RESULT "+json.dumps(s))
else:
  try:
    out(status="publishing",uid=s["uid"],container=s["container"])
    r=call("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",{"ig_user_id":s["uid"],"creation_id":s["container"],"max_wait_seconds":150 if P["format"]=="reel" else 60})
    mid=str(dig(r,"id") or "")
    if not mid: raise Exception("published, but no media id came back: "+json.dumps(r)[:300])
    url=""
    for i in range(3):
      try:
        url=dig(call("INSTAGRAM_GET_IG_MEDIA",{"ig_media_id":mid,"fields":"id,permalink,timestamp"}),"permalink") or ""
      except Exception: url=""
      if url: break
      time.sleep(4)
    out(status="posted",id=mid,url=url)
  except Exception as e:
    out(status="error",stage="publish",error=str(e)[:500])
`;
  return [a, b, c];
}

/** Pinterest, in one cell: look for the pin on the board, then create it and read it back. */
export function pinterestCells(p: Payload): string[] {
  const { lit, sha } = embed(p);
  return [`${HEAD(lit, sha, p.run)}
try:
  if not _OK: raise Exception("integrity: the payload was not copied exactly")
  board=call("PINTEREST_GET_BOARD",{"board_id":P["board"]})
  if str(dig(board,"id"))!=P["board"]: raise Exception("board "+P["board"]+" not found on this account")
  found=None
  for it in items(call("PINTEREST_LIST_PINS",{"board_id":P["board"],"page_size":100})):
    if norm(it.get("title"))==norm(P["title"]) and ts(it.get("created_at",""))>=P["since"]: found=it; break
  if found: out(status="found",id=str(found["id"]),url="https://www.pinterest.com/pin/"+str(found["id"])+"/")
  elif P["mode"]!="publish":
    fetch(P["media"][0]); out(status="checked",board=dig(board,"name"))
  else:
    data=base64.b64encode(fetch(P["media"][0])).decode()
    a={"board_id":P["board"],"title":P["title"][:100],"description":P["caption"][:800],"media_source":{"source_type":"image_base64","content_type":P["media"][0]["mimetype"],"data":data}}
    if P.get("link"): a["link"]=P["link"]
    if P.get("alt"): a["alt_text"]=P["alt"][:500]
    out(status="publishing")
    pid=str(dig(call("PINTEREST_CREATE_PIN",a),"id") or "")
    if not pid: raise Exception("the pin call returned no id")
    got=call("PINTEREST_GET_PIN",{"pin_id":pid})
    if str(dig(got,"id"))!=pid: raise Exception("pin "+pid+" didn't read back")
    out(status="posted",id=pid,url="https://www.pinterest.com/pin/"+pid+"/")
except Exception as e:
  out(status="error",stage="pin",error=str(e)[:500])
`];
}

/** The cell that asks Composio's file store for upload slots. Its upload links are short-lived and only HQ
 *  reads them (from the tool result); they're never logged. */
export function slotsCell(run: string, n: number): string {
  return `import os,json,requests
_B=os.environ.get("BACKEND_URL","https://backend.composio.dev")
_H={"x-session-access-key":os.environ.get("COMPOSIO_WORKBENCH_ACCESS_KEY",""),"Content-Type":"application/json"}
try:
  s=[requests.post(_B+"/api/v3/tool_router/internal/presigned_url",json={"operation":"upload"},headers=_H,timeout=30).json() for _ in range(${n})]
  print("HQ_RESULT "+json.dumps({"run":"${run}","status":"slots","slots":[{"upload":x["upload_url"],"download":x["download_url"]} for x in s]}))
except Exception as e:
  print("HQ_RESULT "+json.dumps({"run":"${run}","status":"error","stage":"slots","error":str(e)[:300]}))
`;
}

/** The prompt for the headless run: pass each cell to the workbench verbatim, in order, then stop. */
export function workbenchPrompt(cells: string[], role = "posting helper"): string {
  return [
    `You are HQ's ${role}. Your only job is to run the Python cells below in the Composio remote workbench, exactly as written.`,
    "",
    `For each cell, in order, call mcp__claude_ai_Composio__COMPOSIO_REMOTE_WORKBENCH once with code_to_execute set to the cell's text, copied character for character (no edits, no reformatting, no comments added). There ${cells.length === 1 ? "is 1 cell" : `are ${cells.length} cells`}. Run every cell even if an earlier one printed an error: each cell checks for itself whether it has anything to do.`,
    "Do not call any other tool, do not retry a cell, and do not try to fix anything. When the last cell has run, reply with the single word DONE.",
    "",
    ...cells.flatMap((c, i) => [`=== CELL ${i + 1} START ===`, c.trimEnd(), `=== CELL ${i + 1} END ===`, ""]),
  ].join("\n");
}

export type CellResult = { run: string; status: string; [k: string]: unknown };

/** Every HQ_RESULT line printed by the workbench in a stream-json transcript, from tool results only. */
export function resultsFromStream(stream: string, run: string): CellResult[] {
  const out: CellResult[] = [];
  const texts: string[] = [];
  for (const line of stream.split("\n")) {
    let j: { type?: string; message?: { content?: unknown } };
    try { j = JSON.parse(line); } catch { continue; }
    if (j.type !== "user" || !Array.isArray(j.message?.content)) continue;
    for (const c of j.message!.content as { type?: string; content?: unknown }[]) {
      if (c?.type !== "tool_result") continue;
      const parts = Array.isArray(c.content) ? c.content : [c.content];
      for (const p of parts) texts.push(typeof p === "string" ? p : typeof (p as { text?: unknown })?.text === "string" ? (p as { text: string }).text : "");
    }
  }
  for (const t of texts) {
    // The workbench wraps stdout in its own JSON; unwrap it when it parses, else read the raw text.
    let stdout = t;
    try { const w = JSON.parse(t); stdout = String(w?.data?.stdout ?? w?.stdout ?? t); } catch { /* raw */ }
    for (const l of stdout.split("\n")) {
      const m = l.match(/^HQ_RESULT (\{.*\})\s*$/);
      if (!m) continue;
      try { const r = JSON.parse(m[1]) as CellResult; if (r.run === run) out.push(r); } catch { /* not ours */ }
    }
  }
  return out;
}

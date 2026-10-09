// The Composio workbench cell HQ hands a headless Claude Code run to email one approved partner draft (or the owner's
// own test). Pure: lib/partner-sender.ts runs it. Same pattern as automatic posting (lib/social-publish.ts): the cell
// carries its payload with a sha256 and refuses to run if the copy isn't exact, and HQ reads its HQ_RESULT line from
// the tool output, never from the model's words.
//
// On a retry (an earlier attempt exists) the cell first looks in the provider's sent mail for the same subject to the
// same address since the first attempt. If it's there, HQ records that message instead of sending again.
import { embed, HEAD } from "./social-publish";
import type { SenderRoute } from "./partner-outreach";

export type EmailPayload = {
  run: string;
  via: SenderRoute;
  account: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
  /** Unix seconds: a sent message at or after this with the same subject and recipient is this one. */
  since: number;
  /** "send" sends (after a look, on a retry); "check" only looks. */
  mode: "send" | "check";
  retry: boolean;
};

const resendCell = `
def when(t):
  try: return datetime.datetime.strptime((t or "")[:19].replace("T"," "),"%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc).timestamp()
  except Exception: return 0
try:
  if not _OK: raise Exception("integrity: the payload was not copied exactly")
  found=None
  if P["retry"] or P["mode"]=="check":
    for it in items(call("RESEND_LIST_EMAILS",{"limit":100})):
      to=[str(x).lower() for x in (it.get("to") or [])]
      if P["to"].lower() in to and norm(it.get("subject"))==norm(P["subject"]) and when(it.get("created_at"))>=P["since"]: found=it; break
  if found: out(status="found",id=str(found.get("id")))
  elif P["mode"]=="check": out(status="not-found")
  else:
    out(status="sending")
    a={"from":P["from"],"to":P["to"],"subject":P["subject"],"text":P["text"]}
    if P.get("replyTo"): a["reply_to"]=P["replyTo"]
    if P.get("headers"): a["headers"]=P["headers"]
    mid=str(dig(call("RESEND_SEND_EMAIL",a),"id") or "")
    if not mid: raise Exception("the provider returned no message id")
    out(status="sent",id=mid)
except Exception as e:
  out(status="error",error=str(e)[:500])
`;

const gmailCell = `
try:
  if not _OK: raise Exception("integrity: the payload was not copied exactly")
  found=None
  if P["retry"] or P["mode"]=="check":
    day=datetime.datetime.fromtimestamp(P["since"]-86400,datetime.timezone.utc).strftime("%Y/%m/%d")
    q="in:sent to:"+P["to"]+" after:"+day
    r=call("GMAIL_FETCH_EMAILS",{"query":q,"max_results":20,"verbose":False,"include_payload":False})
    for it in (dig(r,"messages") or items(r) or []):
      if isinstance(it,dict) and norm(it.get("subject"))==norm(P["subject"]): found=it; break
  if found: out(status="found",id=str(found.get("messageId") or found.get("id")))
  elif P["mode"]=="check": out(status="not-found")
  else:
    out(status="sending")
    mid=str(dig(call("GMAIL_SEND_EMAIL",{"recipient_email":P["to"],"subject":P["subject"],"body":P["text"],"from_email":P["from"].split("<")[-1].rstrip(">").strip()}),"id") or "")
    if not mid: raise Exception("the provider returned no message id")
    out(status="sent",id=mid)
except Exception as e:
  out(status="error",error=str(e)[:500])
`;

/** The one cell that emails a draft through the business's Composio sender. */
export function emailCell(p: EmailPayload): string {
  const { lit, sha } = embed(p);
  return `${HEAD(lit, sha, p.run)}${p.via === "composio-gmail" ? gmailCell : resendCell}`;
}

/** List-Unsubscribe pointing at the reply-to address, so mail apps show their own unsubscribe button. */
export function unsubscribeHeaders(replyTo: string): Record<string, string> {
  return { "List-Unsubscribe": `<mailto:${replyTo}?subject=${encodeURIComponent("no thanks")}>` };
}

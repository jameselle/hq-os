// The Email designs tab: every email the business's flows actually send, read live from its engine (the same HTML
// customers get), followed by the brand kit's own designs that no flow sends (welcome emails, proposals). A kit design
// with the same subject as a flow email is left out: the live one is the truth. Pure and client-safe.
import type { BrandKit } from "./brand";
import type { LifecycleSnapshot } from "./lifecycle";

type Email = BrandKit["emails"][number];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MODE: Record<string, string> = { auto: "Live: sends on its own", draft: "Live: each batch asks you first", off: "Off: nothing is sent" };

/** Readable text from an email's HTML, for the plain-text view. */
export function htmlText(html: string): string {
  return html.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The flow emails (first, in flow order) and the kit's own designs, as one kit for the preview panel; null with neither. */
export function emailDesigns(kit: BrandKit | null, snapshot: LifecycleSnapshot | null | undefined): BrandKit | null {
  const flowEmails: Email[] = (snapshot?.flows ?? []).filter((f) => f.channel === "email").flatMap((f) => f.messages.map((m) => ({
    id: `flow-${m.id}`, label: `${f.label}: ${m.label}`, subject: m.subject, sender: "As the flow sends it (the business's own sender)",
    trigger: f.trigger, status: f.mode ? MODE[f.mode] ?? f.mode : "Live: always on", text: htmlText(m.html), html: m.html || undefined,
    source: `Sent by the "${f.label}" flow, read live from the business's engine`,
  })));
  const sent = new Set(flowEmails.map((e) => norm(e.subject)));
  const kitOnly = (kit?.emails ?? []).filter((e) => !sent.has(norm(e.subject))).map((e) => ({ ...e, label: `Brand kit: ${e.label}` }));
  if (!flowEmails.length && !kit) return null;
  const base: BrandKit = kit ?? { version: 1, updatedAt: snapshot?.observedAt ?? "", status: "", guide: "", colors: [], assets: [], emails: [] };
  return { ...base, emails: [...flowEmails, ...kitOnly] };
}

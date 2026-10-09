// Renders a social draft's cards (carousel slides, pins, stories, link images) to PNG in the business's brand
// colours, with headless Chromium from @playwright/test. Colours come from the brand kit by use (background, body
// text, primary action, accent), with plain defaults when a kit is missing. Server-only.
import fs from "node:fs";
import path from "node:path";

import { readBrand } from "./brand";
import { CARD_SIZE, type Slide, type SocialDraft } from "./social";
import { readSocialConfig } from "./social-store";
import { businessDir, getProfile } from "./store";

type Palette = { bg: string; ink: string; primary: string; accent: string };
const pick = (colors: { hex: string; use: string; name: string }[], re: RegExp, fallback: string) =>
  colors.find((c) => re.test(`${c.use} ${c.name}`))?.hex ?? fallback;

export function paletteFor(slug: string): Palette {
  return paletteFrom(readBrand(slug)?.colors ?? []);
}

/** The card colours from a brand kit's colours, picked by what each is used for. Pure; exported for tests. */
export function paletteFrom(c: { hex: string; use: string; name: string }[]): Palette {
  const ink = pick(c, /body text|ink|text/i, "#111827");
  // Buttons and actions first: "Primary background" also says primary, and white text vanishes on it.
  const colour = c.filter((x) => !/background|canvas|surface/i.test(`${x.use} ${x.name}`));
  const primary = pick(colour, /button|action/i, pick(colour, /primary|brand/i, "#1d4ed8"));
  return {
    bg: pick(c, /background|canvas/i, "#ffffff"),
    ink,
    primary: luminance(primary) > 0.4 ? ink : primary,
    accent: pick(c, /accent|highlight/i, "#93c5fd"),
  };
}

/** Relative luminance, 0 (black) to 1 (white), so the hook card never puts white text on a pale colour. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function markFor(slug: string): string | null {
  const kit = readBrand(slug);
  const a = kit?.assets.find((x) => /mark|logo/i.test(`${x.label} ${x.file}`) && /\.(png|jpe?g|svg)$/i.test(x.file));
  if (!a) return null;
  const file = path.join(businessDir(slug), "brand", a.file);
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg").replace("svg", "svg+xml");
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
/** Headlines keep hyphenated words together ("write-up" never breaks after the hyphen): a non-breaking hyphen. */
const head = (s: string) => esc(s).replace(/-/g, "\u2011");

export type CardFonts = { heading: string; body: string };
const DEFAULT_FONTS: CardFonts = { heading: "Inter", body: "Inter" };
const fontStack = (f: string) => `"${f.replace(/"/g, "")}",-apple-system,"Helvetica Neue",Arial,sans-serif`;
/** Google Fonts CSS for the card fonts (400 and 700 exist in nearly every family; a weight a family lacks fails the whole request). */
export function fontsHref(f: CardFonts): string {
  const fam = [...new Set([f.heading, f.body])].map((x) => `family=${encodeURIComponent(x).replace(/%20/g, "+")}:wght@400;700`);
  return `https://fonts.googleapis.com/css2?${fam.join("&")}&display=block`;
}

/** Headline size for a length: short hooks shout, long ones step down so they never run off the card. */
const fit = (t: string, sizes: [number, number, number, number]) => (t.length <= 20 ? sizes[0] : t.length <= 40 ? sizes[1] : t.length <= 60 ? sizes[2] : sizes[3]);

/** One card's HTML. Pure apart from the inputs; exported for tests. Layout comes from the slide's kind: cover (slide 1
 *  by default), point, stat, list, compare or cta. */
export function cardHtml(o: {
  title: string; body?: string; slide?: Slide; index: number; total: number; brand: string; handle?: string;
  palette: Palette; mark: string | null; w: number; h: number; fonts?: CardFonts;
  /** The business's site, shown on a single card (a pin or link image), where the click goes. */
  site?: string;
  /** A frame of a slideshow Reel: no swipe cues, and everything kept clear of Instagram's caption and buttons. */
  reel?: boolean;
}): string {
  const { w, h } = o;
  const sl: Slide = o.slide ?? { title: o.title, body: o.body };
  const kind = sl.kind ?? (o.index === 1 ? "cover" : "point");
  const dark = kind === "cover" || kind === "cta";
  const f = o.fonts ?? DEFAULT_FONTS;
  const s = Math.min(w, h) / 1080, px = (n: number) => `${Math.round(n * s)}px`;
  const bg = kind === "cover" ? o.palette.primary : kind === "cta" ? o.palette.ink : o.palette.bg;
  const ink = dark ? "#ffffff" : o.palette.ink;
  const pop = dark ? o.palette.accent : o.palette.primary;
  const last = o.index === o.total;
  const num = String(o.index).padStart(2, "0");
  const who = o.handle || o.brand;

  const body = sl.body ? `<p class="body">${esc(sl.body)}</p>` : "";
  let main: string;
  switch (kind) {
    case "cover":
      main = `<h1 style="font-size:${px(fit(sl.title, [132, 112, 94, 80]))}">${head(sl.title)}</h1>${body}`; break;
    case "stat":
      main = `<div class="kicker">${num}</div><div class="stat">${esc(sl.stat ?? "")}</div><h2 style="font-size:${px(fit(sl.title, [76, 68, 60, 54]))}">${head(sl.title)}</h2>${body}`; break;
    case "list":
      main = `<div class="kicker">${num}</div><h2 style="font-size:${px(fit(sl.title, [84, 74, 64, 56]))}">${head(sl.title)}</h2>
<ol class="items">${(sl.items ?? []).map((x, i) => `<li><span class="n">${i + 1}</span><span>${esc(x)}</span></li>`).join("")}</ol>${body}`; break;
    case "compare": {
      const c = sl.compare ?? { from: "", to: "" };
      main = `<div class="kicker">${num}</div><h2 style="font-size:${px(fit(sl.title, [84, 74, 64, 56]))}">${head(sl.title)}</h2>
<div class="cmp"><div class="side from"><div class="v">${esc(c.from)}</div>${c.fromLabel ? `<div class="l">${esc(c.fromLabel)}</div>` : ""}</div>
<div class="arrow">→</div><div class="side to"><div class="v">${esc(c.to)}</div>${c.toLabel ? `<div class="l">${esc(c.toLabel)}</div>` : ""}</div></div>${body}`; break;
    }
    case "cta":
      main = `<h1 style="font-size:${px(fit(sl.title, [112, 96, 84, 72]))}">${head(sl.title)}</h1>${body}
<div class="chips"><span class="chip solid">Save this for later</span>${o.handle ? `<span class="chip">Follow ${esc(o.handle)}</span>` : ""}</div>`; break;
    default:
      main = `<div class="kicker">${num}</div><h2 style="font-size:${px(fit(sl.title, [96, 84, 72, 62]))}">${head(sl.title)}</h2>${body}`;
  }

  const host = o.site ? o.site.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "") : "";
  const segs = o.total > 1 ? `<div class="prog">${Array.from({ length: o.total }, (_, i) => `<i class="${i < o.index ? "on" : ""}"></i>`).join("")}</div>`
    : host ? `<span class="site">${esc(host)}</span>` : "<div></div>";
  const next = o.total > 1 && !last && !o.reel ? (kind === "cover" ? `<span class="swipe">Swipe →</span>` : `<span class="arr">→</span>`) : "";
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${fontsHref(f)}"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;background:${bg};color:${ink};font-family:${fontStack(f.body)};-webkit-font-smoothing:antialiased}
.card{position:relative;width:100%;height:100%;padding:${o.reel ? `${px(260)} ${px(150)} ${px(520)} ${px(88)}` : `${px(176)} ${px(88)} ${px(200)}`};display:flex;flex-direction:column;justify-content:center;gap:${px(34)};overflow:hidden}
.blob{position:absolute;right:${px(-220)};top:${px(-220)};width:${px(640)};height:${px(640)};border-radius:50%;background:${pop};opacity:${dark ? 0.18 : 0.08}}
.top{position:absolute;left:${px(88)};right:${px(o.reel ? 150 : 88)};top:${px(o.reel ? 150 : 72)};display:flex;align-items:center;justify-content:space-between;font-size:${px(30)};font-weight:700;opacity:.8}
.top .who{display:flex;align-items:center;gap:${px(16)}}
.top img{height:${px(56)};width:${px(56)};object-fit:contain;border-radius:${px(12)}}
h1,h2,.stat,.kicker,.v,.n{font-family:${fontStack(f.heading)};font-weight:700;letter-spacing:-0.02em}
h1{line-height:1.02}
h2{line-height:1.06}
.kicker{font-size:${px(44)};color:${pop};letter-spacing:.04em}
.stat{font-size:${px(sl.stat && sl.stat.length > 6 ? 170 : 240)};line-height:.95;color:${pop}}
.body{font-size:${px(44)};line-height:1.38;opacity:.82;max-width:${px(860)};white-space:pre-line}
.items{list-style:none;display:flex;flex-direction:column;gap:${px(22)}}
.items li{display:flex;align-items:flex-start;gap:${px(26)};font-size:${px(44)};line-height:1.3}
.items .n{flex:none;width:${px(64)};height:${px(64)};border-radius:50%;background:${pop};color:#fff;display:grid;place-items:center;font-size:${px(34)}}
.cmp{display:flex;align-items:stretch;gap:${px(24)}}
.side{flex:1;border-radius:${px(28)};padding:${px(36)} ${px(32)};display:flex;flex-direction:column;gap:${px(10)}}
.from{background:${dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.05)"}}
.to{background:${pop};color:#fff}
.v{font-size:${px(112)};line-height:1}
.l{font-size:${px(30)};line-height:1.3;opacity:.85}
.arrow{align-self:center;font-size:${px(72)};font-weight:700;color:${pop}}
.chips{display:flex;flex-wrap:wrap;gap:${px(18)};margin-top:${px(12)}}
.chip{font-size:${px(34)};font-weight:700;padding:${px(18)} ${px(30)};border-radius:${px(999)};border:${px(3)} solid rgba(255,255,255,.6)}
.chip.solid{background:${o.palette.accent};border-color:${o.palette.accent};color:${o.palette.ink}}
.foot{position:absolute;left:${px(88)};right:${px(o.reel ? 150 : 88)};bottom:${px(o.reel ? 430 : 80)};display:flex;align-items:center;justify-content:space-between}
.prog{display:flex;gap:${px(8)};width:${px(Math.min(420, 60 * o.total))}}
.prog i{flex:1;height:${px(8)};border-radius:${px(8)};background:${dark ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.12)"}}
.prog i.on{background:${dark ? "#fff" : pop}}
.swipe{font-size:${px(34)};font-weight:700;padding:${px(16)} ${px(30)};border-radius:${px(999)};background:#fff;color:${o.palette.primary}}
.site{font-size:${px(34)};font-weight:700;padding:${px(16)} ${px(30)};border-radius:${px(999)};background:#fff;color:${o.palette.primary}}
.arr{font-size:${px(56)};font-weight:700;color:${pop}}
</style></head><body><div class="card"><div class="blob"></div>
<div class="top"><span class="who">${o.mark ? `<img src="${o.mark}" alt="">` : ""}${esc(who)}</span>${o.total > 1 ? `<span>${o.index}/${o.total}</span>` : ""}</div>
${main}
<div class="foot">${segs}${next}</div></div></body></html>`;
}

/** Render every card of a draft; returns the PNG paths (relative to the business folder). With reel, the slides are
 *  rendered as 9:16 frames for a slideshow Reel (lib/social-slideshow.ts) instead. */
export async function renderCards(slug: string, week: string, d: SocialDraft, opts: { reel?: boolean } = {}): Promise<string[]> {
  if (!d.slides?.length) return [];
  const size = opts.reel ? CARD_SIZE.story : CARD_SIZE[d.format] ?? CARD_SIZE.carousel;
  const profile = getProfile(slug);
  const palette = paletteFor(slug), mark = markFor(slug);
  const cfg = readSocialConfig(slug);
  const fonts: CardFonts = { heading: cfg?.fonts?.heading ?? DEFAULT_FONTS.heading, body: cfg?.fonts?.body ?? DEFAULT_FONTS.body };
  const spec = profile?.channels?.[d.network];
  const handle = cfg?.networks?.[d.network]?.handle ?? (typeof spec === "string" ? spec : spec?.handle);
  const rel = path.join("social", "media", week);
  const dir = path.join(businessDir(slug), rel);
  fs.mkdirSync(dir, { recursive: true });
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    const out: string[] = [];
    for (const [i, s] of d.slides.entries()) {
      await page.setContent(cardHtml({ title: s.title, body: s.body, slide: s, index: i + 1, total: d.slides.length, brand: profile?.name ?? "", handle: handle?.startsWith("@") ? handle : undefined, site: profile?.sites?.[0], palette, mark, w: size.w, h: size.h, fonts, reel: opts.reel }), { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
      // Brand fonts come from Google Fonts; without a network the system font stands in.
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      const file = `${d.id}${opts.reel ? "-reel" : ""}-${i + 1}.png`;
      await page.screenshot({ path: path.join(dir, file), type: "png" });
      out.push(path.join(rel, file));
    }
    return out;
  } finally { await browser.close(); }
}

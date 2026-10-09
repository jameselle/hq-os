import { test } from "node:test";
import assert from "node:assert/strict";

import { askedKeyword, checkSocial, decideSocial, keywordDmTool, slideProblem, weekOf, validateSocialConfig, type SocialConfig, type SocialDraft } from "../lib/social";
import { cardHtml, fontsHref, paletteFrom } from "../lib/social-cards";

const post = (o: Partial<SocialDraft> = {}): SocialDraft => ({
  id: "2026-10-13-instagram-1", network: "instagram", format: "carousel", day: "2026-10-13",
  caption: "Cold brew keeps for a week. Here is how to make it right.", hashtags: ["coldbrew", "coffee"],
  slides: [{ title: "Cold brew at home", body: "Coarse grind, 12 hours." }, { title: "Save this", body: "Link in bio." }],
  why: "From this week's blog post", status: "draft", ...o,
});
const ctx = { regulated: [] as never[], sites: ["https://coffee.example"] };
const failed = (d: SocialDraft, c: Record<string, unknown> = {}) => checkSocial(d, { ...ctx, ...c }).filter((x) => !x.ok).map((x) => x.id);

test("a well made post passes every check", () => {
  assert.deepEqual(failed(post()), []);
});

test("each network's limits apply", () => {
  assert.ok(failed(post({ network: "x", format: "post", slides: undefined, caption: "x".repeat(300) })).includes("caption"));
  assert.ok(failed(post({ hashtags: ["a", "b", "c", "d", "e", "f"] })).includes("hashtags"));
  assert.ok(failed(post({ slides: [{ title: "One" }] })).includes("cards"));
  assert.ok(failed(post({ network: "pinterest", format: "pin", slides: [{ title: "Pin" }], hashtags: [] })).includes("pin-title"));
  assert.ok(failed(post({ format: "reel", slides: undefined })).includes("video"));
});

test("X counts a link as 23 characters, and unknown formats fail", () => {
  const link = "https://coffee.example/blog/a-very-long-article-slug-about-cold-brew-and-how-long-it-keeps/";
  const x = (caption: string) => post({ network: "x", format: "post", slides: undefined, hashtags: [], caption });
  assert.ok(!failed(x(`${"y".repeat(250)} ${link}`)).includes("caption"));
  assert.ok(failed(x(`${"y".repeat(260)} ${link}`)).includes("caption"));
  assert.ok(failed(post({ format: "text" as never })).includes("format"));
});

test("dashes, outside links, claims, inducements and never-name entries fail", () => {
  assert.ok(failed(post({ caption: "Fast — and cheap." })).includes("dashes"));
  assert.ok(failed(post({ link: "https://elsewhere.example/x" })).includes("link"));
  const g = { regulated: ["gambling"] as never[] };
  assert.ok(failed(post({ caption: "Use promo code WIN. 18+" }), g).includes("claims"));
  assert.ok(failed(post({ caption: "Prices explained." }), g).includes("age"));
  assert.ok(!failed(post({ network: "linkedin", format: "post", slides: undefined, hashtags: [], caption: "Our engineering week." }), g).includes("age"));
  assert.ok(failed(post({ caption: "Seen on Polymarket. 18+" }), { banned: ["polymarket"] }).includes("claims"));
});

test("who posts decides what happens after approval; week one waits", () => {
  const c: SocialConfig = { mode: "auto", networks: { instagram: { posting: "hq" }, x: { posting: "hand" }, tiktok: { posting: "elsewhere" } }, approveUntil: "2026-10-13T00:00:00Z" };
  const ok = { ...post(), checks: checkSocial(post(), ctx) };
  assert.equal(decideSocial(c, ok, new Date("2026-10-08")), "wait");
  assert.equal(decideSocial(c, { ...ok, status: "approved" }, new Date("2026-10-08")), "publish");
  assert.equal(decideSocial(c, { ...ok, network: "x" , status: "approved" }, new Date("2026-10-08")), "hand");
  assert.equal(decideSocial(c, { ...ok, network: "tiktok" }, new Date("2026-10-20")), "done");
  assert.equal(decideSocial(c, ok, new Date("2026-10-20")), "publish");
  assert.equal(decideSocial(c, { ...ok, checks: [{ id: "x", label: "X", ok: false, detail: "" }], status: "approved" }, new Date("2026-10-20")), "blocked");
  assert.throws(() => validateSocialConfig({ mode: "auto", networks: { myspace: { posting: "hq" } } }), /unknown network/);
});

test("weeks are ISO weeks in the business's timezone", () => {
  assert.equal(weekOf(new Date("2026-10-05T14:30:00Z"), "Australia/Sydney"), "2026-W41");
  assert.equal(weekOf(new Date("2026-10-04T12:00:00Z"), "UTC"), "2026-W40");
});

test("card HTML escapes the text", () => {
  const h = cardHtml({ title: "<b>x</b>", body: "a & b", index: 1, total: 2, brand: "Demo", palette: { bg: "#fff", ink: "#000", primary: "#00f", accent: "#0ff" }, mark: null, w: 1080, h: 1350 });
  assert.ok(!h.includes("<b>x</b>"));
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(h, /a &amp; b/);
  assert.match(h, /1\/2/);
});

test("the hook colour is a button colour, never a pale background", () => {
  const kit = [
    { hex: "#ffffff", use: "Primary background", name: "Canvas" },
    { hex: "#18231e", use: "Headings and body text", name: "Ink" },
    { hex: "#143e2a", use: "Primary buttons with white text", name: "Forest" },
  ];
  assert.equal(paletteFrom(kit).primary, "#143e2a");
  assert.equal(paletteFrom([kit[0], kit[1], { hex: "#fde68a", use: "Brand", name: "Butter" }]).primary, "#18231e");
  assert.equal(paletteFrom([]).primary, "#1d4ed8");
});

const pal = { bg: "#ffffff", ink: "#111111", primary: "#1d4ed8", accent: "#93c5fd" };
const card = (slide: object, index = 2, total = 5) => cardHtml({ title: "", slide: slide as never, index, total, brand: "Demo", handle: "@demo", palette: pal, mark: null, w: 1080, h: 1350 });

test("slides lay out by kind: cover first, a big stat, a list, a compare and a closing ask", () => {
  assert.match(cardHtml({ title: "Hook", index: 1, total: 5, brand: "Demo", palette: pal, mark: null, w: 1080, h: 1350 }), /Swipe →/);
  assert.match(card({ kind: "stat", stat: "118%", title: "Margin" }), /class="stat">118%</);
  assert.equal((card({ kind: "list", title: "Steps", items: ["One", "Two", "Three"] }).match(/<li>/g) ?? []).length, 3);
  const c = card({ kind: "compare", title: "After commission", compare: { from: "2.12", to: "2.05", toLabel: "After 6%" } });
  assert.match(c, /2\.12[\s\S]*→[\s\S]*2\.05/);
  const end = card({ kind: "cta", title: "Read the guide" }, 5, 5);
  assert.match(end, /Follow @demo/);
  assert.ok(!/Swipe|class="arr"/.test(end), "the last slide has no swipe cue");
});

test("a slide that won't read at a glance fails its check", () => {
  assert.equal(slideProblem({ title: "Fine", body: "Short line." }), "");
  assert.match(slideProblem({ title: "x".repeat(71) }), /title/);
  assert.match(slideProblem({ title: "Long", body: "word ".repeat(41) }), /41 words/);
  assert.match(slideProblem({ title: "Stat", kind: "stat" }), /stat/);
  assert.match(slideProblem({ title: "List", kind: "list", items: ["one"] }), /2 to 6/);
  assert.match(slideProblem({ title: "Cmp", kind: "compare", compare: { from: "1", to: "" } }), /from and a to/);
  assert.match(slideProblem({ title: "Odd", kind: "fancy" as never }), /unknown kind/);
  assert.ok(failed(post({ slides: [{ title: "Cover" }, { title: "Stat", kind: "stat" }] })).includes("slides"));
});

test("card fonts come from Google Fonts at weights every family has", () => {
  assert.equal(fontsHref({ heading: "Fredoka", body: "Inter" }), "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;700&family=Inter:wght@400;700&display=block");
  assert.equal(fontsHref({ heading: "Inter", body: "Inter" }), "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=block");
});

test("headlines never break after a hyphen, and a single card shows the site", () => {
  assert.match(card({ kind: "cta", title: "Read the full write-up" }, 5, 5), /write\u2011up/);
  const pin = cardHtml({ title: "Pin", index: 1, total: 1, brand: "Demo", palette: pal, mark: null, w: 1000, h: 1500, site: "https://www.demo.example/" });
  assert.match(pin, /class="site">demo\.example</);
  assert.ok(!/class="site"/.test(card({ title: "Point" })), "carousels show progress, not the site");
});

test("a comment keyword fails without a keyword-DM tool on that network, and passes with one", () => {
  const ask = post({ caption: "Comment BREW and we'll DM you the guide." });
  assert.ok(failed(ask).includes("keyword"), "nothing answers comments for this business");
  assert.ok(failed(post({ keyword: "BREW" })).includes("keyword"), "the keyword field alone counts as an ask");
  assert.ok(failed(post({ slides: [{ title: "Want the guide?", body: "Comment the word BREW" }, { title: "Save this" }] })).includes("keyword"));
  assert.ok(!failed(ask, { keywordDms: ["instagram"] }).includes("keyword"));
  assert.ok(failed(post({ network: "tiktok", format: "reel", slides: undefined, video: { brief: "x" }, caption: "Comment BREW" }), { keywordDms: ["instagram"] }).includes("keyword"));
  assert.ok(!failed(post({ caption: "Comment below with your brew ratio. Link in bio." })).includes("keyword"), "\"comment below\" is not a keyword ask");
  assert.equal(failed(post()).includes("keyword"), false);
  assert.equal(askedKeyword(post({ caption: 'Comment "BREW" for the link' })), "BREW");
});

test("keywordDmTool: social.json keywordDms, or Instagram replies that leave keywords to a bot", () => {
  const base: SocialConfig = { mode: "draft", networks: { instagram: { posting: "hq" }, tiktok: { posting: "hand" } } };
  assert.equal(keywordDmTool(base, "instagram"), null);
  assert.equal(keywordDmTool({ ...base, keywordDms: { tool: "comment-dm" } }, "instagram"), "comment-dm");
  assert.equal(keywordDmTool({ ...base, keywordDms: { tool: "comment-dm" } }, "tiktok"), null, "Instagram only when networks is unset");
  assert.equal(keywordDmTool({ ...base, keywordDms: { tool: "ManyChat", networks: ["instagram", "tiktok"] } }, "tiktok"), "ManyChat");
  assert.equal(keywordDmTool({ ...base, replies: { instagram: { keychain: "token", skipKeywords: ["CLIP"] } } }, "instagram"), "comment-dm");
  assert.equal(keywordDmTool({ ...base, replies: { instagram: { keychain: "token" } } }, "instagram"), null);
  assert.doesNotThrow(() => validateSocialConfig({ ...base, keywordDms: { tool: "comment-dm", networks: ["instagram"] } }));
  assert.throws(() => validateSocialConfig({ ...base, keywordDms: { tool: "", networks: ["myspace"] } }), /keywordDms/);
});

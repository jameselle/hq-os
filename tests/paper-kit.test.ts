import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { THEMES } from "../lib/studio/brand";

const THEMES_DIR = path.join(__dirname, "..", "templates", "studio", "themes");
const KIT = path.join(THEMES_DIR, "paper");

test("paper kit: the demo writes one renderable HyperFrames project per card, every token filled", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "hq-paper-"));
  try {
    const r = spawnSync("python3", [path.join(KIT, "paper.py"), out, "@demo"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const cards = r.stdout.trim().split("\n");
    assert.ok(cards.length >= 12, "one card of each kind");
    for (const c of cards) {
      const html = fs.readFileSync(path.join(out, c, "index.html"), "utf8");
      assert.match(html, /data-composition-id="main"/);
      assert.match(html, /window\.__timelines\["main"\] = tl/);
      assert.doesNotMatch(html, /\$[A-Z_]+\$/, `${c}: a colour token left unfilled`);
      assert.doesNotMatch(html, /[–—]/, `${c}: no em or en dashes`);
      for (const f of ["hyperframes.json", "package.json", "assets/SFNS.ttf"]) assert.ok(fs.existsSync(path.join(out, c, f)), `${c}/${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("paper kit: words ink in on the voice's times, dashes are refused, and its colours match the Studio theme", () => {
  const py = `
import sys, json; sys.path.insert(0, ${JSON.stringify(KIT)})
import paper
print(json.dumps(paper.map_times(["This", "kit", "works"], [("This", 0.1), ("tool", 0.4), ("really", 0.6), ("works", 0.9)])))
try:
    paper.headline("x", "fast \\u2014 cheap")
    print("no-refusal")
except ValueError:
    print("refused")
print(paper.ACCENT, paper.INK)
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const [times, refusal, colours] = r.stdout.trim().split("\n");
  assert.deepEqual(JSON.parse(times), [0.1, 0.22, 0.9], "matched words take the voice's time; an unmatched one follows the word before");
  assert.equal(refusal, "refused");
  assert.equal(colours, `${THEMES.paper.highlight} ${THEMES.paper.primary}`, "kit tokens and THEMES.paper agree");
});

test("themed kit: every kit theme writes the demo, and its colours agree with the Studio theme of the same name", () => {
  const py = `
import sys, json; sys.path.insert(0, ${JSON.stringify(THEMES_DIR)})
import kit
print(json.dumps({k: [v["tokens"]["accent"], v["tokens"].get("caption-ink", v["tokens"]["ink"])] for k, v in kit.THEMES.items()}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const kitThemes = JSON.parse(r.stdout) as Record<string, [string, string]>;
  assert.ok(Object.keys(kitThemes).length >= 3);
  for (const [name, [accent, ink]] of Object.entries(kitThemes)) {
    const t = THEMES[name as keyof typeof THEMES];
    assert.ok(t, `kit theme ${name} has a Studio theme`);
    assert.equal(t.highlight, accent, `${name}: accent`);
    assert.equal(t.primary, ink, `${name}: caption ink`);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), `hq-kit-${name}-`));
    try {
      const w = spawnSync("python3", [path.join(THEMES_DIR, "kit.py"), out, name], { encoding: "utf8" });
      assert.equal(w.status, 0, w.stderr);
      for (const c of w.stdout.trim().split("\n")) {
        const html = fs.readFileSync(path.join(out, c, "index.html"), "utf8");
        assert.doesNotMatch(html, /\$[A-Z_]+\$/, `${name}/${c}: unfilled token`);
        assert.match(html, /--accent: /);
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }
});

test("themed kit: Lucide icons by name, GSAP plugins only where asked, registry pieces mounted with their files", () => {
  const py = `
import sys, json, os, tempfile; sys.path.insert(0, ${JSON.stringify(THEMES_DIR)})
import kit
out = {"lucide": kit.icon("rocket").startswith("<svg viewBox=\\"0 0 24 24\\""), "own": "ic-a" in kit.icon("spark")}
try:
    kit.icon("no-such-icon-anywhere"); out["refused"] = False
except ValueError:
    out["refused"] = True
d = tempfile.mkdtemp()
kit.write_cards({"k": kit.kinetic("k", "Made with {code}"), "h": kit.headline("h", "plain {card}")}, d, theme="paper")
out["split"] = "SplitText.min.js" in open(os.path.join(d, "k", "index.html")).read()
out["noplug"] = "SplitText" not in open(os.path.join(d, "h", "index.html")).read().split("<style>")[0]
if (kit.REGISTRY / "components" / "vox-annotate").exists():
    kit.write_cards({"a": kit.annotate("a", "The milk is at the back", "back", note="by design")}, d, theme="terminal")
    html = open(os.path.join(d, "a", "index.html")).read()
    out["reg"] = ('data-composition-src="compositions/components/vox-annotate.html"' in html and os.path.exists(os.path.join(d, "a", "compositions", "components", "vox-annotate.html"))
                  and "#reg * { --accent: #5EEC84 !important" in html)
else:
    out["reg"] = "skipped"
print(json.dumps(out))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.equal(o.lucide, true, "a Lucide icon by name");
  assert.equal(o.own, true, "our own icons still win");
  assert.equal(o.refused, true, "unknown icon names are refused");
  assert.equal(o.split, true, "the kinetic card loads SplitText");
  assert.equal(o.noplug, true, "a plain card loads no plugin");
  assert.ok(o.reg === true || o.reg === "skipped", "a registry piece is mounted, its files copied, the theme pinned inside");
});

test("editorial cards: every one writes in every kit theme", () => {
  const py = `
import sys, json, tempfile; sys.path.insert(0, ${JSON.stringify(THEMES_DIR)})
import kit_editorial as ke
ok = {}
for t in ke.THEMES:
    d = tempfile.mkdtemp()
    ok[t] = len(ke.write_cards(ke.demo(), d, theme=t))
print(json.dumps(ok))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const ok = JSON.parse(r.stdout) as Record<string, number>;
  assert.ok(Object.keys(ok).length >= 18);
  for (const [t, n] of Object.entries(ok)) assert.ok(n >= 8, `${t}: ${n} editorial cards`);
});

#!/usr/bin/env python3
"""Editorial cards for HQ Studio's themed kit: charts with a story, Swiss stat anchors, split quotes, kinetic
type, decision trees, rankings, a percentage ring and a timeline. Same contract as kit.py: every helper returns
dict(dur, css, body, js, words, captions, exit), colours and type come from the theme's CSS variables, so every
card works in every theme.

    import sys; sys.path.insert(0, "<HQ>/templates/studio/themes")
    from kit_editorial import *          # also brings in everything from kit
    G = {"ch": chart_story("ch", "Weekly {visitors}", [120, 180, 260, 410, 690], labels=["W1", "W2", "W3", "W4", "W5"],
                           mark=2, note="Posting daily from week three")}
    write_cards(G, outdir, theme="chart")

Provenance. The looks and timings are re-implemented from these open-source templates (no code copied verbatim;
our own markup, maths and GSAP timelines in the kit's idiom):
  nexu-io/html-video (Apache-2.0), commit c414ecc, templates/:
    chart_story   <- frame-nyt-graph/compositions/nyt-chart.html (Copyright Hyperframes / heygen-com, Apache-2.0)
                     and frame-data-chart-nyt/source/index.html (html-video original)
    stat_anchor   <- frame-pentagram-stat/source/index.html (distilled by html-video from huashu-design, MIT, alchaincyf)
    split_quote   <- frame-electric-studio/source/index.html (distilled by html-video from frontend-slides, MIT, Zara Zhang)
    kinetic_lines <- frame-kinetic-type/compositions/main-graphics.html (Copyright Hyperframes / heygen-com, Apache-2.0)
                     and frame-bold-poster/source/index.html (from frontend-slides, MIT, Zara Zhang)
    flow_tree     <- frame-decision-tree/compositions/decision_tree.html (Copyright Hyperframes / heygen-com, Apache-2.0)
    ranking       <- frame-data-rollup/source/DataRollup.tsx (html-video original: bars grow while figures roll)
  iart-ai/data-animation-skills and explainer-video-skills (MIT), for the ring and the timeline:
    donut         <- data-animation-skills/skills/chart-animation (draw the mark, roll the figure on the same curve)
    timeline      <- explainer-video-skills/skills/diagram-animation (a spine that draws, nodes that land on it)
Studio names in upstream provenance are inspiration only; nothing here names or imitates them.

Run `python3 kit_editorial.py <outdir> <theme>` to write the demo set (invented data, no business named).
"""
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import *  # noqa: F401,F403  (re-exported so callers import one module)
from kit import _no_dash, _plain, _seed, _spans, _words, esc, write_cards

# ------------------------------------------------------------------------------------------------ shared bits
# An editorial header: a short accent flag, a mono kicker, the title wiping in left to right (the news-chart
# move). Used by the data cards so a set of them reads as one publication.


def _head(kicker, title, top=310):
    _no_dash(kicker, title)
    tw = _words(title) if title else []
    kk = (f'<div id="ehk" style="margin-top:22px;font-family:PMono;font-size:26px;font-weight:600;letter-spacing:0.16em;'
          f'text-transform:uppercase;color:var(--e-lab)">{esc(kicker)}</div>') if kicker else ""
    tt = (f'<div id="eht" class="big" style="margin-top:14px;font-size:calc(66px * var(--head-scale));line-height:1.04;'
          f'color:var(--ink);max-width:920px">{_spans(tw)}</div>') if title else ""
    return (f'<div id="eh" style="position:absolute;left:80px;right:80px;top:{top}px;text-align:left">'
            f'<i id="ehf" style="display:block;width:72px;height:10px;background:var(--accent)"></i>{kk}{tt}</div>')


HEAD_JS = """
  function headIn(tl, at) {
    const t = document.getElementById("eht");
    if (t) fitH(t, 210, 38);
    tl.fromTo("#ehf", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.45, ease: "expo.out" }, at);
    if (document.getElementById("ehk")) rise(tl, "#ehk", at + 0.08, { y: 14, d: 0.35 });
    if (t) tl.fromTo(t, { clipPath: "inset(-10% 100% -10% 0%)", opacity: 1 }, { clipPath: "inset(-10% 0% -10% 0%)", duration: 0.8, ease: "power2.inOut" }, at + 0.16);
  }
  function headBottom() {
    const h = document.getElementById("eh");
    return h ? h.offsetTop + h.offsetHeight : 300;
  }
  function roll(tl, el, at, d, to, o) {
    o = o || {};
    const dec = o.dec || 0, obj = { v: o.from || 0 };
    const fmt = v => (o.prefix || "") + Number(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (o.suffix || "");
    el.textContent = fmt(obj.v);
    tl.to(obj, { v: to, duration: d, ease: o.ease || "power3.out", onUpdate: () => { el.textContent = fmt(obj.v); } }, at);
  }
"""


# Small labels use a darker soft (soft mixed toward ink) so they pass 3:1 on every theme's page.
ED_CSS = (":root { --e-lab: color-mix(in srgb, var(--soft) 60%, var(--ink)); }\n"
          "#env, #elv, #edv, .erv { font-variant-numeric: tabular-nums; }\n")  # rolling digits must not jitter


def _ed(**spec):
    spec["css"] = ED_CSS + spec.get("css", "")
    return spec


def _dec(*vals):
    """Decimal places to show for a set of numbers (at most 2)."""
    out = 0
    for v in vals:
        s = repr(float(v)).rstrip("0").rstrip(".")
        if "." in s:
            out = max(out, min(2, len(s.split(".")[1])))
    return out


def _fmt(v, dec=0, prefix="", suffix=""):
    return f"{prefix}{v:,.{dec}f}{suffix}"


def _nice_ticks(lo, hi, n=4):
    span = (hi - lo) or abs(hi) or 1
    raw = span / n
    mag = 10 ** math.floor(math.log10(raw))
    step = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)
    start, end = math.floor(lo / step) * step, math.ceil(hi / step) * step
    ticks, t = [], start
    while t <= end + step / 2:
        ticks.append(round(t, 10))
        t += step
    return ticks, step


# ------------------------------------------------------------------------------------------------ cards


def chart_story(gid, title, values, labels=None, mark=None, note=None, kicker=None, prefix="", suffix="", source=None,
                dur=6, exit=True):
    """A news-style line chart that tells one point: the title wipes in under an accent flag, gridlines rise
    bottom to top, the line draws left to right with a dot riding its head, the stretch from `mark` (an index)
    on turns accent with a soft fill, the last value rolls up, then an annotation callout draws a leader to the
    marked point. values: numbers; labels: x labels (same length; long sets show every other). note: one short
    sentence. Studio's captions carry the voice."""
    _no_dash(note, kicker, source, prefix, suffix, *(labels or []))
    n = len(values)
    if n < 2:
        raise ValueError("chart_story: at least two values")
    if mark is not None and not 0 <= mark < n - 1:
        raise ValueError("chart_story: mark must index a point before the last")
    lo, hi = min(values), max(values)
    if lo >= 0 and lo <= 0.6 * hi:
        lo = 0
    ticks, step = _nice_ticks(lo, hi, 4)
    t0, t1 = ticks[0], ticks[-1]
    dec_t, dec_v = _dec(step), _dec(*values)
    PW, X0, X1, YT, YB = 920, 24, 860, 40, 500
    xs = [X0 + i * (X1 - X0) / (n - 1) for i in range(n)]
    ys = [YB - (v - t0) / ((t1 - t0) or 1) * (YB - YT) for v in values]
    pts = list(zip(xs, ys))
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(n - 1)]
    m = mark if mark is not None else n - 1
    grid = "".join(
        f'<line class="egl" x1="0" y1="{YB - (t - t0) / ((t1 - t0) or 1) * (YB - YT):.1f}" x2="{PW}" y2="{YB - (t - t0) / ((t1 - t0) or 1) * (YB - YT):.1f}" '
        f'style="stroke:var(--ink)" stroke-opacity="0.16" stroke-width="2"/>'
        f'<text class="eyl" x="0" y="{YB - (t - t0) / ((t1 - t0) or 1) * (YB - YT) - 12:.1f}" style="fill:var(--e-lab);font-family:PMono;font-size:24px;font-weight:500">'
        f'{esc(_fmt(t, dec_t, prefix, suffix))}</text>'
        for t in ticks[1:])
    every = 1 if n <= 7 else 2
    xl = "".join(f'<text class="exl" x="{x:.1f}" y="{YB + 46}" text-anchor="middle" style="fill:var(--e-lab);font-family:PMono;font-size:26px;font-weight:500">{esc(lb)}</text>'
                 for i, (x, lb) in enumerate(zip(xs, labels or [])) if i % every == 0 or i == n - 1 or i == m)
    poly = lambda ps: "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in ps)
    base = poly(pts[: m + 1]) if m > 0 else ""
    acc = poly(pts[m:]) if m < n - 1 else ""
    area = (f'<path d="{poly(pts[m:])} L {xs[-1]:.1f} {YB} L {xs[m]:.1f} {YB} Z" style="fill:var(--accent)" fill-opacity="0.13" clip-path="url(#ecc)"/>'
            if acc else "")
    dots = "".join(f'<circle class="epd" cx="{x:.1f}" cy="{y:.1f}" r="{8 if i >= m else 6}" style="fill:{"var(--accent)" if i >= m and acc else "var(--ink)"}"/>'
                   for i, (x, y) in enumerate(pts))
    # the annotation goes in the emptiest box near the marked point (sampled along the line)
    samples = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        k = max(1, int(math.dist((ax, ay), (bx, by)) / 12))
        samples += [(ax + (bx - ax) * j / k, ay + (by - ay) * j / k) for j in range(k + 1)]
    NW, NH = 400, 150
    best = None
    if note:
        for bx in (30, 260, 490):
            for by in (40, 150, 260, 340):
                hits = sum(1 for sx, sy in samples if bx - 30 < sx < bx + NW + 30 and by - 30 < sy < by + NH + 30)
                hits += sum(1 for x, y in pts[-1:] if bx - 60 < x < bx + NW + 60 and by - 90 < y < by + NH + 30) * 50
                d = math.dist((bx + NW / 2, by + NH / 2), pts[m])
                key = (hits, d)
                if best is None or key < best[0]:
                    best = (key, bx, by)
    lx, ly = pts[-1]
    last = (f'<text id="elv" x="{min(lx, PW - 4):.1f}" y="{ly - 30:.1f}" text-anchor="end" style="fill:var(--accent);font-family:PSans;font-size:46px;font-weight:850">'
            f'{esc(_fmt(values[-1], dec_v, prefix, suffix))}</text>')
    mlab = ""
    if mark is not None:
        mx, my = pts[m]
        mlab = (f'<circle id="emr" cx="{mx:.1f}" cy="{my:.1f}" r="22" fill="none" style="stroke:var(--accent)" stroke-width="4"/>'
                f'<text id="emv" x="{mx:.1f}" y="{my + 64:.1f}" text-anchor="middle" style="fill:var(--ink);font-family:PSans;font-size:30px;font-weight:750">'
                f'{esc(_fmt(values[m], dec_v, prefix, suffix))}</text>')
    nt = ""
    if note:
        _, bx, by = best
        nt = (f'<div id="ent" style="position:absolute;left:{bx}px;top:{by}px;width:max-content;max-width:{NW}px;text-align:left;font-size:34px;font-weight:650;'
              f'line-height:1.22;color:var(--ink);font-style:italic;padding-left:20px;border-left:5px solid var(--accent)">{esc(note)}</div>')
    src = (f'<div id="esrc" style="position:absolute;left:80px;top:1236px;font-family:PMono;font-size:22px;color:var(--e-lab);letter-spacing:0.04em">'
           f'Source: {esc(source)}</div>') if source else ""
    body = f"""{_head(kicker, title)}
<div id="ecw" style="position:absolute;left:80px;top:620px;width:{PW}px;height:560px">
  <svg id="ecs" viewBox="0 0 {PW} 560" style="position:absolute;left:0;top:0;width:{PW}px;height:560px;overflow:visible">
    <defs><clipPath id="ecc"><rect id="eccr" x="{xs[m]:.1f}" y="0" width="0" height="560"/></clipPath></defs>
    {grid}
    <line id="ebl" class="dr" x1="0" y1="{YB}" x2="{PW}" y2="{YB}" style="stroke:var(--ink)" stroke-width="3"/>
    {xl}{area}
    {f'<path id="elb" class="dr" d="{base}" fill="none" style="stroke:var(--ink)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>' if base else ''}
    {f'<path id="ela" class="dr" d="{acc}" fill="none" style="stroke:var(--accent)" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>' if acc else ''}
    {dots}{mlab}
    <path id="eld" class="dr" d="M 0 0" fill="none" style="stroke:var(--ink)" stroke-width="3" stroke-dasharray="2 0"/>
    <circle id="ehd" cx="{xs[0]:.1f}" cy="{ys[0]:.1f}" r="11" style="fill:var(--accent)"/>
    {last}
  </svg>{nt}
</div>{src}"""
    js = HEAD_JS + """
  const P = __PTS__, SEG = __SEG__, M = __M__, N = P.length, HAS_ACC = __ACC__;
  headIn(tl, 0.1);
  const gl = gsap.utils.toArray(".egl"), yl = gsap.utils.toArray(".eyl");
  gl.forEach((g, i) => {
    tl.fromTo(g, { opacity: 0, attr: { x2: 0 } }, { opacity: 1, attr: { x2: __PW__ }, duration: 0.5, ease: "power2.out" }, 0.45 + i * 0.08);
    tl.fromTo(yl[i], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 0.55 + i * 0.08);
  });
  draw(tl, "#ebl", 0.4, 0.5, { ease: "power2.out" });
  rise(tl, ".exl", 0.75, { y: 12, stagger: 0.04, d: 0.3 });
  // the line: ease none so the riding dot stays on the head; each segment's time is its share of the length
  const L0 = 1.0, LD = Math.min(2.2, Math.max(1.2, DUR * 0.3)), TOT = SEG.reduce((a, b) => a + b, 0);
  const segT = SEG.map(s => LD * s / TOT), at = [L0];
  segT.forEach((s, i) => at.push(at[i] + s));
  if (document.getElementById("elb")) tl.to("#elb", { strokeDashoffset: 0, duration: at[M] - L0, ease: "none" }, L0);
  if (HAS_ACC) {
    tl.to("#ela", { strokeDashoffset: 0, duration: at[N - 1] - at[M], ease: "none" }, at[M]);
    tl.fromTo("#eccr", { attr: { width: 0 } }, { attr: { width: P[N - 1][0] - P[M][0] + 2 } , duration: at[N - 1] - at[M], ease: "none" }, at[M]);
  }
  tl.fromTo("#ehd", { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.2 }, L0 - 0.05);
  for (let i = 1; i < N; i++) tl.to("#ehd", { attr: { cx: P[i][0], cy: P[i][1] }, duration: segT[i - 1], ease: "none" }, at[i - 1]);
  tl.to("#ehd", { opacity: 0, scale: 0.4, duration: 0.25 }, at[N - 1] + 0.05);
  gsap.utils.toArray(".epd").forEach((d, i) => tl.fromTo(d, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(3)" }, at[i] - 0.02));
  if (document.getElementById("emr")) {
    tl.fromTo("#emr", { opacity: 0, scale: 0.3, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.4)" }, at[M] + 0.05);
    rise(tl, "#emv", at[M] + 0.12, { y: 10, d: 0.3 });
  }
  const LE = at[N - 1];
  tl.fromTo("#elv", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, LE);
  roll(tl, document.getElementById("elv"), LE, 0.7, __LAST__, { dec: __DEC__, prefix: __PRE__, suffix: __SUF__ });
  let e = LE + 0.7;
  const nt = document.getElementById("ent");
  if (nt) {
    // a leader from the note's nearest edge to the marked point, drawn after layout
    const tx = P[M][0], ty = P[M][1];
    const nx = nt.offsetLeft, ny = nt.offsetTop, nw = nt.offsetWidth, nh = nt.offsetHeight;
    const sx = tx < nx ? nx - 10 : (tx > nx + nw ? nx + nw + 10 : nx + nw / 2);
    const sy = sx === nx + nw / 2 ? (ty < ny ? ny - 10 : ny + nh + 10) : ny + nh / 2;
    const ex = tx + (sx < tx ? -26 : 26) * (Math.abs(sx - tx) > 30 ? 1 : 0), ey = ty + (sy < ty ? -26 : 26);
    const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 30;
    document.getElementById("eld").setAttribute("d", `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`);
    prepDraw(document.getElementById("ecs"));
    draw(tl, "#eld", LE + 0.25, 0.45, { ease: "power2.inOut" });
    tl.fromTo(nt, { opacity: 0, x: -24, filter: "blur(6px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }, LE + 0.4);
    e = LE + 0.9;
  } else { gsap.set("#eld", { opacity: 0 }); }
  if (document.getElementById("esrc")) tl.fromTo("#esrc", { opacity: 0 }, { opacity: 1, duration: 0.4 }, e);
  hold(tl, "#ecw", e + 0.2, DUR);
"""
    js = (js.replace("__PTS__", json.dumps([[round(x, 1), round(y, 1)] for x, y in pts])).replace("__SEG__", json.dumps([round(s, 1) for s in seg]))
          .replace("__M__", str(m)).replace("__ACC__", "true" if acc else "false").replace("__PW__", str(PW))
          .replace("__LAST__", repr(float(values[-1]))).replace("__DEC__", str(dec_v)).replace("__PRE__", json.dumps(prefix)).replace("__SUF__", json.dumps(suffix)))
    return _ed(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def stat_anchor(gid, label, value, sub=None, suffix="", prefix="", bars=None, stats=(), dur=5, exit=True):
    """A Swiss-grid stat: hairline grid rules sweep in, a giant ghost of the number bleeds off the right edge,
    the label in accent capitals, the number rolling up with an accent full stop (or the suffix in accent), an
    accent rule growing, a soft line under it, optional mini bars (bars: [(label, value, accent?)], real
    figures only) and a strip of up to three side stats [(value text, label)]."""
    _no_dash(label, sub, suffix, prefix, *[b[0] for b in (bars or [])], *[x for s in stats for x in s])
    dec = _dec(value)
    ghost = esc(f"{int(abs(value)):,}" if abs(value) >= 1 else _fmt(value, dec))
    tail = f'<span style="color:var(--accent)">{esc(suffix)}</span>' if suffix else '<span style="color:var(--accent)">.</span>'
    rules = ('<i class="esr" style="position:absolute;left:80px;right:80px;top:330px;height:2px;background:var(--ink);opacity:0.14;display:block"></i>'
             '<i class="esr" style="position:absolute;left:80px;right:80px;top:1110px;height:2px;background:var(--ink);opacity:0.14;display:block"></i>'
             + "".join(f'<i class="esv" style="position:absolute;left:{x}px;top:280px;width:2px;height:1010px;background:var(--ink);opacity:0.10;display:block"></i>'
                       for x in (80, 540, 998)))
    bh = ""
    if bars:
        mx = max(b[1] for b in bars) or 1
        cols = "".join(
            f'<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;width:96px">'
            f'<div class="esb" style="width:64px;height:{max(0.05, b[1] / mx) * 170:.0f}px;background:{"var(--accent)" if (b[2] if len(b) > 2 else b[1] == mx) else "var(--ink)"};'
            f'opacity:{1 if (b[2] if len(b) > 2 else b[1] == mx) else 0.22}"></div>'
            f'<div class="ebl" style="margin-top:12px;font-family:PMono;font-size:22px;color:var(--e-lab);white-space:nowrap">{esc(b[0])}</div></div>'
            for b in bars[:6])
        bh = f'<div id="ebars" style="position:absolute;left:80px;top:{880 if stats else 900}px;height:210px;display:flex;gap:18px;align-items:flex-end">{cols}</div>'
    st = ""
    if stats:
        cells = "".join(f'<div class="ess" style="display:flex;align-items:center;gap:14px;white-space:nowrap"><i style="width:14px;height:14px;background:var(--accent);display:block;flex:none"></i>'
                        f'<b style="font-size:40px;font-weight:850;color:var(--page)">{esc(v)}</b>'
                        f'<span style="font-size:24px;font-weight:650;letter-spacing:0.12em;text-transform:uppercase;color:var(--page);opacity:0.72">{esc(lb)}</span></div>'
                        for v, lb in stats[:3])
        st = (f'<div id="estrip" style="position:absolute;left:80px;right:80px;top:1140px;height:118px;background:var(--ink);border-radius:6px;'
              f'display:flex;align-items:center;justify-content:space-around;padding:0 30px;gap:24px;overflow:hidden">{cells}</div>')
    body = f"""{rules}
<svg id="egh" viewBox="0 0 1080 800" style="position:absolute;left:0;top:330px;width:1080px;height:800px;overflow:hidden"><text x="1074" y="660" text-anchor="end" style="fill:var(--ink);font-family:PSans;font-weight:900;font-size:760px;letter-spacing:-0.06em">{ghost}</text></svg>
<div id="ecol" style="position:absolute;left:80px;right:80px;top:380px;text-align:left">
  <div id="elb2" style="font-size:30px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:var(--accent)">{esc(label)}</div>
  <div id="nb" style="display:inline-block;margin-top:26px;font-family:var(--head-family), PSans;font-weight:var(--head-weight);font-style:var(--head-style);font-size:calc(250px * var(--head-scale));line-height:1;letter-spacing:-0.04em;color:var(--ink);white-space:nowrap"><span id="env">{esc(_fmt(value, dec, prefix))}</span>{tail}</div>
  <i id="erl" style="display:block;width:380px;height:12px;background:var(--accent);margin-top:22px"></i>
  {f'<div id="esub" class="lead" style="margin-top:30px;max-width:820px;text-align:left;color:var(--e-lab)">{esc(sub)}</div>' if sub else ''}
</div>{bh}{st}"""
    js = HEAD_JS + """
  const nb = document.getElementById("nb");
  fitW(nb, 900, 90);
  const col = document.getElementById("ecol"), bars = document.getElementById("ebars");
  if (bars) { const b = col.offsetTop + col.offsetHeight + 40; if (b > bars.offsetTop) bars.style.top = b + "px"; }
  tl.fromTo(".esr", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.7, ease: "expo.out", stagger: 0.1 }, 0.05);
  tl.fromTo(".esv", { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.7, ease: "expo.out", stagger: 0.08 }, 0.1);
  tl.fromTo("#egh", { opacity: 0, y: 90 }, { opacity: 0.07, y: 0, duration: 1.1, ease: "expo.out" }, 0.35);
  rise(tl, "#elb2", 0.45, { y: 18, d: 0.45 });
  rise(tl, "#nb", 0.55, { y: 40, from: 0.96, d: 0.6, ease: "expo.out" });
  roll(tl, document.getElementById("env"), 0.55, 1.2, __VAL__, { dec: __DEC__, prefix: __PRE__ });
  tl.fromTo("#erl", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.7, ease: "expo.out" }, 1.15);
  if (document.getElementById("esub")) rise(tl, "#esub", 1.3, { y: 20, d: 0.45 });
  if (bars) {
    tl.fromTo(".esb", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.6, ease: "expo.out", stagger: 0.08 }, 1.4);
    rise(tl, ".ebl", 1.45, { y: 8, d: 0.3, stagger: 0.08 });
  }
  if (document.getElementById("estrip")) {
    tl.fromTo("#estrip", { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "expo.out" }, 1.6);
    rise(tl, ".ess", 1.75, { y: 16, d: 0.35, stagger: 0.1 });
  }
  hold(tl, "#ecol", 2.2, DUR);
"""
    js = js.replace("__VAL__", repr(float(value))).replace("__DEC__", str(dec)).replace("__PRE__", json.dumps(prefix))
    return _ed(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def split_quote(gid, lines, who=None, role=None, split=None, dur=5, exit=True):
    """A quote as the hero: the frame splits, an accent panel rising from below to meet a seam, an ink bar
    growing along the seam, and the quote revealing line by line through masks as each line is said. Lines
    up to `split` (default: all but the last) sit above the seam in ink; the rest land on the accent panel.
    Accent words in braces. Shows the spoken words (Studio's captions step aside)."""
    _no_dash(who, role, *lines)
    split = len(lines) - 1 if split is None else split
    if not 0 < split <= len(lines):
        raise ValueError("split_quote: split must leave at least one line above the seam")
    lw = [_words(t) for t in lines]
    rows = "".join(
        f'<div class="eql{" eqb" if i >= split else ""}" style="overflow:hidden;padding:0 0 0.08em"><div class="eqi">{_spans(ws)}</div></div>'
        for i, ws in enumerate(lw))
    wh = f'<div style="font-size:36px;font-weight:800">{esc(who)}</div>' if who else ""
    rl = (f'<div style="font-size:24px;font-weight:650;letter-spacing:0.16em;text-transform:uppercase;opacity:0.75;margin-top:6px">'
          f'{esc(role)}</div>') if role else ""
    at = (f'<div id="eqa" style="position:absolute;left:80px;right:80px;top:1150px;text-align:left;color:var(--accent-ink)">{wh}{rl}</div>'
          if (who or role) else "")
    css = """
#eqq .eqi { font-family: var(--head-family), "PSans", serif; font-weight: var(--head-weight); font-style: var(--head-style); text-transform: var(--head-case);
  letter-spacing: var(--head-track); line-height: 1.08; color: var(--ink); white-space: nowrap; }
#eqq .eqb .eqi { color: var(--accent-ink); }
#mark { z-index: 3; } #mark span { color: var(--accent-ink); background: rgba(0,0,0,0.10); }
#eqq .eqb .ac { color: var(--accent-ink); text-decoration: underline; text-decoration-thickness: 0.07em; text-underline-offset: 0.12em; }
"""
    body = f"""<div id="eqp" style="position:absolute;left:0;right:0;top:860px;height:1100px;background:var(--accent)"></div>
<div id="eqm" style="position:absolute;left:80px;top:96px;font-family:PGeorgia, PSerif, serif;font-size:220px;line-height:1;color:var(--accent);opacity:0.9">&#8220;</div>
<div id="eqs" style="position:absolute;left:80px;top:856px;width:320px;height:10px;background:var(--ink)"></div>
<div id="eqq" style="position:absolute;left:80px;right:80px;top:400px;text-align:left;font-size:calc(116px * var(--head-scale))">{rows}</div>{at}"""
    js = """
  // size: every line fits 920 px wide, the block fits 800 px tall
  const q = document.getElementById("eqq"), ls = gsap.utils.toArray("#eqq .eqi");
  let fs = parseFloat(getComputedStyle(q).fontSize);
  const widest = () => Math.max(...ls.map(l => l.scrollWidth));
  while ((widest() > 920 || q.offsetHeight > 760) && fs > 40) { fs -= 2; q.style.fontSize = fs + "px"; }
  // the seam sits under the last top line; the quote block is centred on the band around it
  const rows = gsap.utils.toArray("#eqq .eql"), S = __SPLIT__;
  if (rows[S]) rows[S].style.marginTop = Math.round(fs * 0.24) + "px";
  const topH = rows.slice(0, S).reduce((a, r) => a + r.offsetHeight, 0), all = q.offsetHeight;
  // the seam sits low (y ~900) so the top lines own the frame and the accent panel holds the payoff line(s)
  let qt = Math.max(380, 890 - topH);
  qt = Math.min(qt, 1190 - all);
  const seam = qt + topH + Math.round(fs * 0.1);
  q.style.top = qt + "px";
  document.getElementById("eqp").style.top = seam + "px";
  document.getElementById("eqs").style.top = (seam - 5) + "px";
  const mk = document.getElementById("eqm");
  mk.style.top = Math.max(140, qt - 210) + "px";
  const qa = document.getElementById("eqa");
  if (qa) qa.style.top = Math.min(1200, seam + (all - topH) + 50) + "px";
  tl.fromTo("#eqp", { y: 1100 }, { y: 0, duration: 0.9, ease: "expo.out" }, 0.08);
  tl.fromTo("#eqs", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.7, ease: "expo.out" }, 0.75);
  popIn(tl, "#eqm", 0.2, { from: 0.5, y: 20, d: 0.5, ease: "back.out(1.8)" });
  let k = 0, prev = 0.55;
  const counts = __COUNTS__;
  ls.forEach((l, i) => {
    const at = WT && WT[k] != null ? Math.max(prev + 0.08, WT[k] - 0.08) : 0.55 + i * 0.28;
    tl.fromTo(l, { yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: "expo.out" }, at);
    prev = at; k += counts[i];
  });
  if (qa) rise(tl, "#eqa", prev + 0.45, { y: 20, d: 0.5 });
  hold(tl, "#eqq", prev + 0.8, DUR);
"""
    js = js.replace("__SPLIT__", str(split)).replace("__COUNTS__", json.dumps([len(w) for w in lw]))
    return _ed(dur=dur, css=css, body=body, js=js, words=[w for ws in lw for w in _plain(ws)], captions=False, exit=exit)


def kinetic_lines(gid, lines, tilt=True, rule=True, max_px=300, dur=4, exit=True):
    """Kinetic poster type: each line is set to fill the column width (short lines become huge), lines rise
    through masks one after another as they are said, each on its own slight tilt, lines holding an accent
    word (braces) pop in instead, and an accent rule draws under the stack. lines: strings, or (string, px)
    to fix a line's size. Shows the spoken words (Studio's captions step aside)."""
    items = [(ln, None) if isinstance(ln, str) else (ln[0], ln[1]) for ln in lines]
    lw = [_words(t) for t, _ in items]
    tilts = [-3, 0, 2, -1.5, 1, -2] if tilt else [0]
    rows = "".join(
        f'<div class="ekl" style="transform:rotate({tilts[i % len(tilts)]}deg);overflow:hidden;padding:0.02em 0.04em 0.06em;margin:-0.04em 0"'
        f' data-px="{px or 0}"><div class="eki{" ekp" if any(a for _, a in ws) else ""}">{_spans(ws)}</div></div>'
        for i, ((_, px), ws) in enumerate(zip(items, lw)))
    css = """
#ekc .eki { font-family: var(--head-family), "PSans", serif; font-weight: var(--head-weight); font-style: var(--head-style); text-transform: var(--head-case);
  letter-spacing: var(--head-track); line-height: 0.98; white-space: nowrap; color: var(--ink); display: inline-block; }
"""
    body = f"""<div class="col" id="ekc" style="align-items:center">{rows}
  {'<svg style="width:420px;height:36px;margin-top:30px;overflow:visible"><path id="ekr" class="dr" d="M 10 18 H 410" style="stroke:var(--accent)" stroke-width="12" stroke-linecap="round" fill="none"/></svg>' if rule else ''}
</div>"""
    js = """
  // every line grows or shrinks to the column width, capped; then the stack fits the band
  const rows = gsap.utils.toArray("#ekc .ekl"), MAXPX = __MAX__;
  rows.forEach(r => {
    const el = r.querySelector(".eki"), fixed = parseFloat(r.dataset.px);
    el.style.fontSize = "100px";
    const w = el.scrollWidth || 1;
    el.style.fontSize = (fixed || Math.max(40, Math.min(MAXPX, Math.floor(100 * 900 / w)))) + "px";
  });
  const tot = () => rows.reduce((a, r) => a + r.offsetHeight, 0);
  let guard = 0;
  while (tot() > 820 && guard++ < 60) rows.forEach(r => { const el = r.querySelector(".eki"); el.style.fontSize = (parseFloat(el.style.fontSize) * 0.96) + "px"; });
  let k = 0, prev = 0.05;
  const counts = __COUNTS__;
  rows.forEach((r, i) => {
    const el = r.querySelector(".eki");
    const at = WT && WT[k] != null ? Math.max(prev + 0.06, WT[k] - 0.06) : 0.15 + i * 0.4;
    if (el.classList.contains("ekp")) {
      tl.fromTo(el, { opacity: 0, scale: 0.45, filter: "blur(10px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.55, ease: "back.out(1.7)" }, at);
    } else {
      tl.fromTo(el, { yPercent: 110, opacity: 1 }, { yPercent: 0, duration: 0.6, ease: "expo.out" }, at);
    }
    prev = at; k += counts[i];
  });
  let e = prev + 0.45;
  if (document.getElementById("ekr")) { draw(tl, "#ekr", prev + 0.25, 0.55, { ease: "expo.out" }); e = prev + 0.8; }
  hold(tl, "#ekc", e, DUR);
"""
    js = js.replace("__MAX__", str(int(max_px))).replace("__COUNTS__", json.dumps([len(w) for w in lw]))
    return _ed(dur=dur, css=css, body=body, js=js, words=[w for ws in lw for w in _plain(ws)], captions=False, exit=exit)


def flow_tree(gid, root, branches, pick=None, dur=6, exit=True):
    """A decision tree drawn top down: the question card pops, elbow connectors draw to the answers (each edge
    can carry a small label), then to the leaves; finally the chosen path redraws in the accent and its leaf
    lights up while the others dim. branches: [(edge label or "", node text, [leaf texts])], 2 or 3 branches,
    up to 2 leaves each, stacked under their answer. pick = (branch index, leaf index) or None; the picked leaf's
    words are matched to the voice so it lights as it is said. Studio's captions carry the words."""
    _no_dash(root, *[x for b in branches for x in (b[0], b[1], *b[2])])
    nb = len(branches)
    if not 2 <= nb <= 3:
        raise ValueError("flow_tree: 2 or 3 branches")
    if any(len(b[2]) > 2 for b in branches):
        raise ValueError("flow_tree: up to 2 leaves a branch")
    # centres: question, answers, then each answer's leaves stacked under it (an indented outline), so every
    # card gets its branch's full width and leaf text stays large
    Y0, Y1, Y2 = 390, 660, (890, 1070)
    bx = [80 + (920 / nb) * (i + 0.5) for i in range(nb)]
    bw = min(430, 920 / nb - 24)
    card = lambda cid, cls, x, y, w, text, size: (
        f'<div id="{cid}" class="efn {cls}" data-y="{y}" style="position:absolute;left:{x - w / 2:.0f}px;top:{y - 50}px;width:{w:.0f}px;'
        f'transform-origin:50% 0%"><div class="efc" style="font-size:{size}px"><span class="efx">{esc(text)}</span></div></div>')
    nodes = [card("efr", "efr", 540, Y0, 800, root, 52)]
    paths, apaths, labels = [], [], []
    for i, b in enumerate(branches):
        nodes.append(card(f"efb{i}", "efb", bx[i], Y1, bw, b[1], 42))
        d = f"M 540 {Y0 + 44} V {(Y0 + Y1) / 2 - 10:.0f} H {bx[i]:.0f} V {Y1 - 44}"
        paths.append(f'<path class="dr efp1" d="{d}" fill="none" style="stroke:var(--soft)" stroke-width="4" stroke-linejoin="round"/>')
        if b[0]:
            labels.append(f'<div class="efl" style="position:absolute;left:{bx[i] - 110:.0f}px;width:220px;top:{(Y0 + Y1) / 2 + 8:.0f}px;text-align:center">'
                          f'<span style="display:inline-block;font-family:PMono;font-size:26px;font-weight:600;color:var(--e-lab);background:var(--page);padding:4px 16px;border-radius:20px;box-shadow:0 0 0 2px var(--line)">{esc(b[0])}</span></div>')
        if pick and pick[0] == i:
            apaths.append(f'<path class="dr efa" d="{d}" fill="none" style="stroke:var(--accent)" stroke-width="7" stroke-linejoin="round"/>')
        spine = bx[i] - bw / 2 + 28
        left = bx[i] - bw / 2 + 64
        lwid = bx[i] + bw / 2 - left
        for k, leaf in enumerate(b[2]):
            ly = Y2[k]
            nodes.append(card(f"efl{i}_{k}", "efv", left + lwid / 2, ly, lwid, leaf, 38))
            d = f"M {spine:.0f} {Y1 + 44} V {ly} H {left - 4:.0f}"
            paths.append(f'<path class="dr efp2" d="{d}" fill="none" style="stroke:var(--soft)" stroke-width="4" stroke-linejoin="round"/>')
            if pick and tuple(pick) == (i, k):
                apaths.append(f'<path class="dr efa" d="{d}" fill="none" style="stroke:var(--accent)" stroke-width="7" stroke-linejoin="round"/>')
    css = """
.efn .efc { background: var(--card); color: var(--card-text); box-shadow: var(--card-shadow); border-radius: 22px; padding: 22px 18px; overflow-wrap: normal; font-weight: 760;
  line-height: 1.16; letter-spacing: -0.01em; text-align: center; }
.efr .efc { font-family: var(--head-family), "PSans"; font-weight: var(--head-weight); font-style: var(--head-style); text-transform: var(--head-case); }
.efn.on .efc { background: var(--accent); color: var(--accent-ink); }
"""
    body = f"""<div id="eft" style="position:absolute;left:0;top:0;width:1080px;height:1300px">
  <svg style="position:absolute;left:0;top:0;width:1080px;height:1300px;overflow:visible">{"".join(paths)}{"".join(apaths)}</svg>
  {"".join(labels)}{"".join(nodes)}
</div>"""
    pid = f"#efl{pick[0]}_{pick[1]}" if pick else ""
    js = """
  // cards keep their centre: a long label grows the card down, never into the line above
  gsap.utils.toArray(".efn").forEach(n => { const c = n.querySelector(".efc"); fitH(c, n.classList.contains("efr") ? 230 : 190, 22);
    let fs = parseFloat(getComputedStyle(c).fontSize); while (c.scrollWidth > c.clientWidth + 1 && fs > 20) { fs -= 1; c.style.fontSize = fs + "px"; } });
  gsap.utils.toArray(".efn").forEach(n => { n.style.top = (parseFloat(n.dataset.y) - n.offsetHeight / 2) + "px"; });
  popIn(tl, ".efr", 0.1, { from: 0.7, y: 20, d: 0.45, ease: "power2.out" });
  draw(tl, ".efp1", 0.75, 0.55, { ease: "power1.inOut", stagger: 0.1 });
  rise(tl, ".efl", 1.0, { y: 10, d: 0.3, stagger: 0.1 });
  popIn(tl, ".efb", 1.2, { from: 0.6, d: 0.42, ease: "back.out(1.7)", stagger: 0.2 });
  const nb = document.querySelectorAll(".efb").length;
  const t2 = 1.2 + 0.2 * nb + 0.3;
  draw(tl, ".efp2", t2, 0.5, { ease: "power1.inOut", stagger: 0.08 });
  popIn(tl, ".efv", t2 + 0.4, { from: 0.6, d: 0.42, ease: "back.out(1.7)", stagger: 0.15 });
  let e = t2 + 0.4 + 0.15 * document.querySelectorAll(".efv").length + 0.4;
  const PID = __PID__;
  if (PID) {
    const pt = WT && WT[0] != null ? Math.max(e, WT[0] - 0.5) : Math.max(e + 0.3, DUR * 0.55);
    draw(tl, ".efa", pt, 0.35, { ease: "power2.inOut", stagger: 0.3 });
    // focus plus context: the other cards stay solid (lines never show through), only their words fade
    const others = gsap.utils.toArray(".efv, .efb").filter(n => "#" + n.id !== PID && !n.dataset.keep).map(n => n.querySelector(".efx"));
    tl.to(others, { opacity: 0.45, duration: 0.35 }, pt + 0.5);
    tl.to(".efp1, .efp2", { opacity: 0.45, duration: 0.35 }, pt + 0.5);
    tl.fromTo(PID + " .efc", { scale: 1 }, { scale: 1.08, duration: 0.25, ease: "power2.out", yoyo: true, repeat: 1 }, pt + 0.6);
    // a fast swap: a slow cross-fade passes through grey text on a grey card
    tl.to(PID + " .efc", { backgroundColor: ACC, duration: 0.12, ease: "none" }, pt + 0.6);
    tl.set(PID + " .efc", { color: CSSV("--accent-ink") }, pt + 0.66);
    e = pt + 1.2;
  }
  hold(tl, "#eft", e, DUR);
"""
    keep = f'#efb{pick[0]}' if pick else ""
    js = js.replace("__PID__", json.dumps(pid))
    if keep:
        js = js.replace("const PID = ", f'document.querySelector("{keep}").dataset.keep = "1";\n  const PID = ')
    words = branches[pick[0]][2][pick[1]].split() if pick else []
    return _ed(dur=dur, css=css, body=body, js=js, words=words, captions=True, exit=exit)


def ranking(gid, title, rows, kicker=None, prefix="", suffix="", climb=True, dur=5, exit=True):
    """A leaderboard: rows [(label, value, accent?)] sorted high to low, bars growing from the left while the
    figures roll up on the same curve. With climb=True the accent row starts at the bottom and then overtakes
    its way up to its true rank (the bar-race moment). Up to 6 rows. Studio's captions carry the words."""
    _no_dash(title, kicker, prefix, suffix, *[r[0] for r in rows])
    rs = sorted(rows, key=lambda r: -r[1])[:6]
    acc = [i for i, r in enumerate(rs) if (r[2] if len(r) > 2 else False)]
    if not acc:
        acc = [0]
    ai = acc[0]
    mx = max(r[1] for r in rs) or 1
    dec = _dec(*[r[1] for r in rs])
    items = "".join(
        f'<div class="err{" era" if i == ai else ""}" style="position:absolute;left:0;right:0;top:0">'
        f'<div style="display:flex;justify-content:space-between;align-items:baseline;gap:20px">'
        f'<span class="erl" style="font-size:38px;font-weight:750;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{esc(r[0])}</span>'
        f'<b class="erv" data-to="{r[1]}" style="font-size:40px;font-weight:850;color:{"var(--accent)" if i == ai else "var(--ink)"};white-space:nowrap">{esc(_fmt(r[1], dec, prefix, suffix))}</b></div>'
        f'<div style="margin-top:12px;height:30px;border-radius:15px;background:var(--muted);opacity:1;position:relative;overflow:hidden">'
        f'<i class="erb" style="position:absolute;left:0;top:0;bottom:0;width:{max(0.03, r[1] / mx) * 100:.1f}%;border-radius:15px;display:block;'
        f'background:{"var(--accent)" if i == ai else "var(--bar-dim)"};{"box-shadow:0 0 30px var(--glow);" if i == ai else ""}"></i></div></div>'
        for i, r in enumerate(rs))
    ranks = "".join(f'<div class="ern" style="position:absolute;left:0;top:0;width:70px;font-family:PMono;font-size:30px;font-weight:600;color:var(--e-lab)">{i + 1:02d}</div>'
                    for i in range(len(rs)))
    css = ".err .erb { } "
    body = f"""{_head(kicker, title)}
<div id="erk" style="position:absolute;left:80px;width:70px;top:560px">{ranks}</div>
<div id="erw" style="position:absolute;left:160px;right:80px;top:560px">{items}</div>"""
    js = HEAD_JS + """
  headIn(tl, 0.08);
  const rows = gsap.utils.toArray(".err"), nums = gsap.utils.toArray(".ern"), N = rows.length, AI = __AI__;
  const top = Math.max(headBottom() + 60, 520), avail = 1250 - top;
  const RH = Math.min(150, Math.floor(avail / N));
  document.getElementById("erw").style.top = top + "px"; document.getElementById("erk").style.top = top + "px";
  rows.forEach((r, i) => { r.style.top = (i * RH) + "px"; nums[i].style.top = (i * RH + 4) + "px"; });
  // climb: the accent row starts last, the rows below its rank sit one place higher, then all settle
  const CLIMB = __CLIMB__ && AI < N - 1;
  if (CLIMB) {
    gsap.set(rows[AI], { y: (N - 1 - AI) * RH });
    for (let i = AI + 1; i < N; i++) gsap.set(rows[i], { y: -RH });
  }
  rows.forEach((r, i) => {
    const slot = CLIMB ? (i === AI ? N - 1 : (i > AI ? i - 1 : i)) : i;
    tl.fromTo(r, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, 0.55 + slot * 0.1);
  });
  rise(tl, ".ern", 0.5, { y: 10, d: 0.3, stagger: 0.08 });
  const G0 = 0.75;
  rows.forEach((r, i) => {
    const slot = CLIMB ? (i === AI ? N - 1 : (i > AI ? i - 1 : i)) : i;
    const at = G0 + slot * 0.12, d = 0.9;
    tl.fromTo(r.querySelector(".erb"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: d, ease: "power3.out" }, at);
    const v = r.querySelector(".erv");
    roll(tl, v, at, d, parseFloat(v.dataset.to), { dec: __DEC__, prefix: __PRE__, suffix: __SUF__ });
  });
  let e = G0 + (N - 1) * 0.12 + 0.9;
  if (CLIMB) {
    const c = e + 0.25;
    tl.to(rows[AI], { y: 0, duration: 0.8, ease: "power3.inOut" }, c);
    for (let i = AI + 1; i < N; i++) tl.to(rows[i], { y: 0, duration: 0.8, ease: "power3.inOut" }, c);
    tl.fromTo(rows[AI], { scale: 1 }, { scale: 1.03, duration: 0.4, ease: "power2.out", yoyo: true, repeat: 1, transformOrigin: "0% 50%" }, c);
    e = c + 0.9;
  }
  tl.fromTo(nums[AI], { color: SOFT }, { color: ACC, duration: 0.3 }, e - 0.2);
  hold(tl, "#erw", e, DUR);
"""
    js = (js.replace("__AI__", str(ai)).replace("__CLIMB__", "true" if climb else "false").replace("__DEC__", str(dec))
          .replace("__PRE__", json.dumps(prefix)).replace("__SUF__", json.dumps(suffix)))
    return _ed(dur=dur, css=css, body=body, js=js, words=[], captions=True, exit=exit)


def donut(gid, value, label, total=100, suffix="%", sub=None, dur=4.5, exit=True):
    """A percentage ring: faint ticks around a track, the accent arc sweeping to value/total while the figure in
    the middle rolls up on the same curve, an end cap that glows, the label and an optional soft line under it.
    For a share like "3 in 4" pass value=3, total=4, suffix="" (the middle reads 3 / 4). Studio's captions
    carry the words."""
    _no_dash(label, sub, suffix)
    frac = max(0.0, min(1.0, value / (total or 1)))
    R, SW, CX, CY = 300, 58, 400, 400
    C = 2 * math.pi * R
    dec = _dec(value)
    ex = CX + R * math.cos(math.radians(-90 + 360 * frac))
    ey = CY + R * math.sin(math.radians(-90 + 360 * frac))
    ticks = "".join(
        f'<line class="edt" x1="{CX + (R + 52) * math.cos(a):.1f}" y1="{CY + (R + 52) * math.sin(a):.1f}" x2="{CX + (R + 66) * math.cos(a):.1f}" '
        f'y2="{CY + (R + 66) * math.sin(a):.1f}" style="stroke:var(--soft)" stroke-width="3" stroke-linecap="round"/>'
        for a in [math.radians(-90 + 360 * k / 40) for k in range(40)])
    of = "" if suffix or total == 100 else f'<span style="font-size:0.42em;color:var(--soft);font-weight:700"> / {esc(_fmt(total, _dec(total)))}</span>'
    body = f"""<div class="col" id="edc" style="justify-content:flex-start;top:330px">
  <div style="position:relative;width:800px;height:800px">
    <svg viewBox="0 0 800 800" style="position:absolute;left:0;top:0;width:800px;height:800px;overflow:visible">
      <defs><filter id="edg" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="14"/></filter></defs>
      {ticks}
      <circle id="edk" cx="{CX}" cy="{CY}" r="{R}" fill="none" style="stroke:var(--ink)" stroke-opacity="0.12" stroke-width="{SW}"/>
      <g transform="rotate(-90 {CX} {CY})"><circle id="eda" cx="{CX}" cy="{CY}" r="{R}" fill="none" style="stroke:var(--accent)" stroke-width="{SW}"
        stroke-linecap="{"round" if 0.02 < frac < 0.98 else "butt"}" stroke-dasharray="{C:.1f} {C + 10:.1f}" stroke-dashoffset="{C:.1f}"/></g>
      <circle id="edgw" cx="{ex:.1f}" cy="{ey:.1f}" r="34" style="fill:var(--accent)" filter="url(#edg)"/>
    </svg>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
      <div id="nb" style="font-family:var(--head-family), PSans;font-weight:var(--head-weight);font-style:var(--head-style);font-size:calc(170px * var(--head-scale));letter-spacing:-0.03em;line-height:1;color:var(--ink);white-space:nowrap"><span id="edv">0</span><span style="color:var(--accent)">{esc(suffix)}</span>{of}</div>
    </div>
  </div>
  <div id="edl" class="big" style="margin-top:20px;font-size:calc(58px * var(--head-scale));color:var(--ink)">{esc(label)}</div>
  {f'<div id="eds" class="lead" style="margin-top:14px;color:var(--e-lab)">{esc(sub)}</div>' if sub else ''}
</div>"""
    js = HEAD_JS + """
  fitW(document.getElementById("nb"), 470, 60);
  fitH(document.getElementById("edl"), 140, 34);
  tl.fromTo("#edk", { opacity: 0, scale: 0.85, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.6, ease: "expo.out" }, 0.1);
  tl.fromTo(".edt", { opacity: 0 }, { opacity: 0.5, duration: 0.2, stagger: 0.012 }, 0.2);
  const D = 1.4, A = 0.55;
  tl.fromTo("#eda", { strokeDashoffset: __C__ }, { strokeDashoffset: __OFF__, duration: D, ease: "power2.inOut" }, A);
  roll(tl, document.getElementById("edv"), A, D, __VAL__, { dec: __DEC__, ease: "power2.inOut" });
  rise(tl, "#nb", 0.3, { y: 20, from: 0.9, d: 0.5 });
  tl.fromTo("#edgw", { opacity: 0, scale: 0.2, transformOrigin: "50% 50%" }, { opacity: 0.85, scale: 1, duration: 0.35, ease: "back.out(2)" }, A + D - 0.1);
  tl.to("#edgw", { opacity: 0.35, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: 3 }, A + D + 0.3);
  rise(tl, "#edl", A + D - 0.2, { y: 24, d: 0.5 });
  if (document.getElementById("eds")) rise(tl, "#eds", A + D + 0.1, { y: 16, d: 0.45 });
  hold(tl, "#edc", A + D + 0.5, DUR);
"""
    js = (js.replace("__C__", f"{C:.1f}").replace("__OFF__", f"{C * (1 - frac):.1f}").replace("__VAL__", repr(float(value)))
          .replace("__DEC__", str(dec)))
    return _ed(dur=dur, css="", body=body, js=js, words=[], captions=True, exit=exit)


def timeline(gid, events, title=None, kicker=None, dur=6, exit=True):
    """A vertical timeline: an accent spine grows down a faint track, each event's node pops as the spine
    reaches it and its date and line slide in; the last event is the accent one. events: [(when, text)] or
    [(when, text, cue)] where cue is the spoken word that event lands on. Up to 5 events. Studio's captions
    carry the words."""
    _no_dash(title, kicker, *[x for ev in events for x in ev[:2]])
    evs = events[:5]
    rows = "".join(
        f'<div class="etr" style="position:absolute;left:0;right:0;top:0;display:flex;align-items:flex-start">'
        f'<div style="position:relative;width:120px;flex:none;height:10px"><i class="etn" style="position:absolute;left:44px;top:6px;width:36px;height:36px;border-radius:50%;'
        f'background:{"var(--accent)" if i == len(evs) - 1 else "var(--page)"};box-shadow:0 0 0 6px var(--accent){", 0 0 30px var(--glow)" if i == len(evs) - 1 else ""};display:block"></i></div>'
        f'<div class="ett" style="flex:1;text-align:left"><div style="font-family:PMono;font-size:30px;font-weight:600;letter-spacing:0.08em;color:var(--accent);text-transform:uppercase">{esc(ev[0])}</div>'
        f'<div style="font-size:44px;font-weight:{800 if i == len(evs) - 1 else 700};line-height:1.16;color:var(--ink);margin-top:6px;max-width:820px">{esc(ev[1])}</div></div></div>'
        for i, ev in enumerate(evs))
    body = f"""{_head(kicker, title) if (title or kicker) else ""}
<div id="etw" style="position:absolute;left:80px;right:60px;top:380px;height:880px">
  <i id="etk" style="position:absolute;left:58px;top:0;width:8px;height:100px;border-radius:4px;background:var(--ink);opacity:0.14;display:block"></i>
  <i id="ets" style="position:absolute;left:58px;top:0;width:8px;height:100px;border-radius:4px;background:var(--accent);display:block"></i>
  {rows}
</div>"""
    js = HEAD_JS + """
  if (document.getElementById("eh")) headIn(tl, 0.08);
  const rows = gsap.utils.toArray(".etr"), N = rows.length;
  const top = document.getElementById("eh") ? Math.max(headBottom() + 70, 520) : 360;
  const wrap = document.getElementById("etw");
  wrap.style.top = top + "px";
  gsap.utils.toArray(".ett").forEach(t => fitH(t, 175, 24));
  const H = 1250 - top, hs = rows.map(r => r.offsetHeight), sumH = hs.reduce((a, b) => a + b, 0);
  const gap = Math.max(18, Math.min(90, (H - sumH) / Math.max(1, N - 1)));
  let y = 0; const ys = [];
  rows.forEach((r, i) => { r.style.top = y + "px"; ys.push(y + 24); y += hs[i] + gap; });
  const spineH = ys[N - 1] - ys[0];
  ["etk", "ets"].forEach(id => { const el = document.getElementById(id); el.style.top = ys[0] + "px"; el.style.height = Math.max(8, spineH) + "px"; });
  tl.fromTo("#etk", { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 1, duration: 0.7, ease: "expo.out" }, 0.3);
  const cues = WT || [];
  const span = Math.max(0.55, (DUR - 2.4) / N);
  let prev = 0.35;
  rows.forEach((r, i) => {
    const at = cues[i] != null ? Math.max(prev + 0.3, cues[i] - 0.15) : 0.5 + i * span;
    if (i > 0) tl.to("#ets", { scaleY: (ys[i] - ys[0]) / Math.max(1, spineH), duration: Math.min(0.5, at - prev), ease: "power2.inOut" }, at - Math.min(0.5, at - prev));
    else tl.fromTo("#ets", { scaleY: 0, transformOrigin: "50% 0%" }, { scaleY: 0, duration: 0.01 }, 0);
    tl.fromTo(r.querySelector(".etn"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, at);
    tl.fromTo(r.querySelector(".ett"), { opacity: 0, x: 40, filter: "blur(6px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }, at + 0.06);
    prev = at;
  });
  hold(tl, "#etw", prev + 0.6, DUR);
"""
    return _ed(dur=dur, css="", body=body, js=js, words=[ev[2] for ev in evs if len(ev) > 2 and ev[2]], captions=True, exit=exit)


# ------------------------------------------------------------------------------------------------ demo


def demo():
    """The editorial cards on invented data (no business named), one of each."""
    return {
        "e-chart": chart_story("e-chart", "Visitors grew {6x} once posts went daily", [1.2, 1.5, 1.4, 2.1, 3.0, 4.6, 7.4],
                               labels=["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"], mark=3, kicker="Weekly visitors, thousands",
                               note="Daily posting starts here", suffix="k", source="invented demo data"),
        "e-stat": stat_anchor("e-stat", "Saved per week", 9.5, suffix=" hrs", sub="by writing every caption from one template",
                              bars=[("Mon", 1.2), ("Tue", 1.9), ("Wed", 2.4), ("Thu", 1.6), ("Fri", 2.4)], stats=[("38", "posts"), ("4", "formats"), ("0", "credits")]),
        "e-quote": split_quote("e-quote", ["Make the first second", "do the work", "of the {whole reel}."], who="A demo editor", role="Invented quote"),
        "e-kin": kinetic_lines("e-kin", ["Stop", "posting", "{everywhere}", "start with one"]),
        "e-tree": flow_tree("e-tree", "Do you have a script?", [("yes", "Record it today", ["Use the teleprompter", "Batch three takes"]),
                                                               ("no", "Start from a hook", ["Pick one formula", "Write five lines"])], pick=(1, 0)),
        "e-rank": ranking("e-rank", "Saves per post by {format}", [("Cheat sheet", 412), ("Carousel", 288), ("Talking head", 174), ("Meme", 96), ("Quote card", 41)],
                          kicker="Invented demo data"),
        "e-ring": donut("e-ring", 62, "of viewers stay past second three", sub="when the hook is on screen"),
        "e-time": timeline("e-time", [("Week 1", "One post a day, no plan"), ("Week 3", "A hook formula for every post"), ("Week 6", "Captions on, watch time doubles"),
                                      ("Week 9", "First reel past one hundred thousand views")], title="How the page {grew}"),
    }


demo_editorial = demo

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: kit_editorial.py <outdir> [theme] [handle]   (writes the editorial demo cards)")
    th = sys.argv[2] if len(sys.argv) > 2 else "paper"
    print("\n".join(write_cards(demo(), sys.argv[1], theme=th, handle=sys.argv[3] if len(sys.argv) > 3 else "@yourbrand")))

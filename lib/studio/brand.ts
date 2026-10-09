// A business's look on video: caption font and colours, hook colours, and
// loudness. Lives at $HQ_DATA/businesses/<slug>/brand.json; anything missing
// falls back to these defaults. Client-safe: no node imports.

export type Brand = {
  /** A font family installed on this Mac (e.g. "Arial Black") or in fontsDir. */
  font: string;
  /** Folder holding the font file, for libass. */
  fontsDir: string;
  primary: string; // caption text, "#RRGGBB"
  outline: string; // caption outline and hook text
  highlight: string; // hook box, and the word being spoken in pop captions
  loudness: number; // LUFS
  /** "pop": words appear as they're spoken, the current one highlighted (CapCut style). "none": whole lines.
   *  "reveal": sentence case on a soft strip (`box`), each word fading in from `muted` to the primary colour. */
  captions: "pop" | "none" | "reveal";
  /** "text": big outlined words that pop in (default). "box": the words on a filled highlight box.
   *  "clean": plain bold words, no outline, that blur in; the highlight words in the highlight colour. */
  hook: "text" | "box" | "clean";
  /** A ready-made look (see THEMES): its font, colours, captions and hook, under anything set beside it. */
  theme?: Theme;
  /** Reveal captions: the colour a word starts at before it settles. */
  muted?: string;
  /** Reveal captions: the strip behind the words. Without one, the words sit on the picture (a soft shadow
   *  under light words). */
  box?: string;
  /** Reveal captions in capitals. */
  upper?: boolean;
  /** The caption font's italic face (e.g. a serif that only reads right in italic). */
  italic?: boolean;
  /** Reveal captions and a clean hook in the bold weight (default: yes, unless italic). */
  bold?: boolean;
  /** Reveal captions' size, as a share of the frame's shorter side (default 0.05). */
  captionSize?: number;
  /** How high the captions sit, as a share of the frame's height from the bottom (default 0.28 vertical). */
  captionLift?: number;
  /** How fast this business's videos play when posted (0.5 to 3). A spec's own `speed` wins. */
  speed: number;
  /** Post covers: "simple" (the day and title over the frame) or "series" (a header line, a huge day number,
   *  the title in two boxes, the face moved between them). */
  cover?: { style: "simple" | "series"; header?: string; sub?: string; headerHighlight?: string };
  /** "clean" (default): the voice chain (rumble cut, less boxiness, presence, softer esses, gentle compression)
   *  before levelling. "plain": levelling only. */
  voice?: "clean" | "plain";
  /** Punch-ins on the face-only lines that matter (numbers, keywords). Off unless the business turns it on. */
  punch?: boolean;
  /** Sound effects: a whoosh into each cutaway, an impact on full-frame cards. Off unless turned on. */
  sfx?: boolean;
};

export const DEFAULT_BRAND: Brand = {
  font: "Arial Black",
  fontsDir: "/System/Library/Fonts/Supplemental",
  primary: "#FFFFFF",
  outline: "#000000",
  highlight: "#FFD60A",
  loudness: -14,
  captions: "pop",
  hook: "text",
  speed: 1,
};

export type Theme =
  | "bold" | "paper" | "gallery" | "desk" | "street" | "terminal" | "chart" | "glass" | "neon" | "canvas"
  | "doodle" | "vivid" | "letterbox" | "lab" | "brief" | "pills" | "chat" | "post" | "poster" | "page";

/** The looks a business (brand.json `theme`) or a single video (spec `theme`) can pick.
 *  "bold": the default, white Arial Black on dark with a yellow highlight.
 *  "paper": warm cream paper, dark sentence-case words, a terracotta accent; captions reveal word by word on a
 *  light strip and the hook blurs in.
 *  "gallery": a pale grey studio; captions one or two words at a time in big italic serif capitals.
 *  "desk": a dark room and a laptop; white words, a red accent for arrows and the ask.
 *  "street": talking-head footage shot around town; small white sentence-case captions low on the frame and
 *  big white keyword slams (spec `slams`).
 *  "terminal": green-tinted black, white words, the keyword in green. "chart": an editorial grey page, white
 *  words on a dark caption box. "glass": lavender light, dark words in a light weight. "neon": violet-black,
 *  white words. "canvas": a design editor's grey, captions as a white text layer. "doodle": handwriting on
 *  near-white. "vivid": white words on saturated gradients, yellow tags. "letterbox": a white page, a casual
 *  hand-lettered font. "lab": white on black. "brief": white on black. "pills": black words on a yellow pill.
 *  "chat": black on white. "post": white serif on black. "poster": white on dark, yellow key words. "page":
 *  black serif on paper.
 *  Every theme but bold and street pairs with the themed card kit (templates/studio/themes/kit.py, same names).
 *  A fontsDir starting "kit:" is a folder inside templates/studio/themes. */
export const THEMES: Record<Theme, Partial<Brand>> = {
  bold: {},
  paper: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#1C1A17",
    outline: "#FBF7EF",
    highlight: "#D2613A",
    muted: "#ABA396",
    box: "#FBF7EF",
    captions: "reveal",
    hook: "clean",
  },
  gallery: {
    font: "Instrument Serif",
    fontsDir: "kit:fonts",
    primary: "#121212",
    outline: "#FFFFFF",
    highlight: "#2F5BEA",
    muted: "#C4C2BD",
    captions: "reveal",
    hook: "clean",
    upper: true,
    italic: true,
    captionSize: 0.085,
  },
  desk: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#E5483B",
    muted: "#8A8178",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.06,
  },
  street: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#FFD60A",
    muted: "#D9D9D9",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.042,
    captionLift: 0.19,
  },
  terminal: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#F2F2F2",
    outline: "#000000",
    highlight: "#5EEC84",
    muted: "#3B453E",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.05,
  },
  chart: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#C13442",
    muted: "#A8A8A8",
    box: "#4D4D4D",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.042,
  },
  glass: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#111111",
    outline: "#FFFFFF",
    highlight: "#6E3AF0",
    muted: "#BFBADE",
    captions: "reveal",
    hook: "clean",
    bold: false,
    captionSize: 0.058,
  },
  neon: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#A78BFA",
    muted: "#4A3A63",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.052,
  },
  canvas: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#111111",
    outline: "#FFFFFF",
    highlight: "#0B84E0",
    muted: "#C2C2C2",
    box: "#FFFFFF",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.045,
  },
  doodle: {
    font: "Caveat",
    fontsDir: "kit:fonts",
    primary: "#1A1917",
    outline: "#FFFFFF",
    highlight: "#2F6FD6",
    muted: "#C9C5BE",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.075,
  },
  vivid: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#F6F20A",
    muted: "#BDB3D6",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.044,
    captionLift: 0.2,
  },
  letterbox: {
    font: "Comic Neue",
    fontsDir: "kit:fonts",
    primary: "#111111",
    outline: "#FFFFFF",
    highlight: "#CC000C",
    muted: "#C8C8C8",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.05,
    captionLift: 0.2,
  },
  lab: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#F8F878",
    muted: "#3A3A3A",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.042,
  },
  brief: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FCFCFC",
    outline: "#000000",
    highlight: "#84F8F8",
    muted: "#3C3C3C",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.045,
  },
  pills: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#000000",
    outline: "#FFFFFF",
    highlight: "#F0D43C",
    muted: "#7A6A1E",
    box: "#F0D43C",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.048,
  },
  chat: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#000000",
    outline: "#FFFFFF",
    highlight: "#1F7FEA",
    muted: "#C7C7CC",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.046,
  },
  post: {
    font: "Georgia",
    fontsDir: "/System/Library/Fonts/Supplemental",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#3B82F6",
    muted: "#3A3A3A",
    captions: "reveal",
    hook: "clean",
    bold: false,
    captionSize: 0.046,
  },
  poster: {
    font: "Helvetica Neue",
    fontsDir: "/System/Library/Fonts",
    primary: "#FFFFFF",
    outline: "#000000",
    highlight: "#FDFD54",
    muted: "#3A3B40",
    captions: "reveal",
    hook: "clean",
    captionSize: 0.046,
  },
  page: {
    font: "Georgia",
    fontsDir: "/System/Library/Fonts/Supplemental",
    primary: "#111111",
    outline: "#FFFFFF",
    highlight: "#8B1E1E",
    muted: "#B5B0A5",
    captions: "reveal",
    hook: "clean",
    bold: false,
    captionSize: 0.05,
  },
};

/** The fields a theme owns: what a video looks like, not how it sounds or how fast it plays. */
const LOOK = ["font", "fontsDir", "primary", "outline", "highlight", "muted", "box", "captions", "hook", "upper", "italic", "bold", "captionSize", "captionLift"] as const;

/** A business's brand with one video's theme on top: the theme's look replaces the business's (font, colours,
 *  captions, hook); loudness, speed, voice, punch-ins, SFX and covers stay the business's. */
export function applyTheme(brand: Brand, theme: Theme): Brand {
  if (!(theme in THEMES)) throw new Error(`theme: one of ${Object.keys(THEMES).join(", ")}`);
  const look: Partial<Brand> = {};
  for (const k of LOOK) (look as Record<string, unknown>)[k] = { ...DEFAULT_BRAND, ...THEMES[theme] }[k];
  return mergeBrand({ ...brand, ...look, theme });
}

export function mergeBrand(partial: Partial<Brand> | null | undefined): Brand {
  const theme = partial?.theme;
  if (theme !== undefined && !(theme in THEMES)) throw new Error(`brand.theme: one of ${Object.keys(THEMES).join(", ")}`);
  const b = { ...DEFAULT_BRAND, ...(theme ? THEMES[theme] : {}), ...(partial ?? {}) };
  for (const k of ["primary", "outline", "highlight"] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(b[k])) throw new Error(`brand.${k}: "#RRGGBB"`);
  }
  for (const k of ["muted", "box"] as const) {
    if (b[k] !== undefined && !/^#[0-9a-f]{6}$/i.test(b[k]!)) throw new Error(`brand.${k}: "#RRGGBB"`);
  }
  if (!(b.loudness <= -6 && b.loudness >= -30)) throw new Error("brand.loudness: between -30 and -6 LUFS");
  for (const k of ["upper", "italic", "bold"] as const) if (b[k] !== undefined && typeof b[k] !== "boolean") throw new Error(`brand.${k}: true or false`);
  if (b.captionSize !== undefined && !(b.captionSize >= 0.03 && b.captionSize <= 0.1)) throw new Error("brand.captionSize: 0.03 to 0.1");
  if (b.captionLift !== undefined && !(b.captionLift >= 0.08 && b.captionLift <= 0.45)) throw new Error("brand.captionLift: 0.08 to 0.45");
  if (!["pop", "none", "reveal"].includes(b.captions)) throw new Error('brand.captions: "pop", "none" or "reveal"');
  if (!["text", "box", "clean"].includes(b.hook)) throw new Error('brand.hook: "text", "box" or "clean"');
  if (!(typeof b.speed === "number" && b.speed >= 0.5 && b.speed <= 3)) throw new Error("brand.speed: a number from 0.5 to 3");
  if (b.voice !== undefined && b.voice !== "clean" && b.voice !== "plain") throw new Error('brand.voice: "clean" or "plain"');
  for (const k of ["punch", "sfx"] as const) if (b[k] !== undefined && typeof b[k] !== "boolean") throw new Error(`brand.${k}: true or false`);
  if (b.cover !== undefined) {
    if (b.cover.style !== "simple" && b.cover.style !== "series") throw new Error('brand.cover.style: "simple" or "series"');
    for (const k of ["header", "sub", "headerHighlight"] as const) {
      const v = b.cover[k];
      if (v !== undefined && (typeof v !== "string" || v.length > 40)) throw new Error(`brand.cover.${k}: text, 40 characters at most`);
      if (typeof v === "string" && /[\u2013\u2014]/.test(v)) throw new Error(`brand.cover.${k}: no em or en dashes`);
    }
  }
  return b;
}

/** The speed a render plays at: the spec's own, else the business's, else 1x. */
export function renderSpeed(spec: { speed?: number }, brand: Pick<Brand, "speed">): number {
  return spec.speed ?? brand.speed;
}

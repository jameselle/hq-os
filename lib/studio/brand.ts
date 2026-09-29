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
  highlight: string; // hook box
  loudness: number; // LUFS
};

export const DEFAULT_BRAND: Brand = {
  font: "Arial Black",
  fontsDir: "/System/Library/Fonts/Supplemental",
  primary: "#FFFFFF",
  outline: "#000000",
  highlight: "#FFD60A",
  loudness: -14,
};

export function mergeBrand(partial: Partial<Brand> | null | undefined): Brand {
  const b = { ...DEFAULT_BRAND, ...(partial ?? {}) };
  for (const k of ["primary", "outline", "highlight"] as const) {
    if (!/^#[0-9a-f]{6}$/i.test(b[k])) throw new Error(`brand.${k}: "#RRGGBB"`);
  }
  if (!(b.loudness <= -6 && b.loudness >= -30)) throw new Error("brand.loudness: between -30 and -6 LUFS");
  return b;
}

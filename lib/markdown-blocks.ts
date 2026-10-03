// Splits a guide's markdown into text and pipe-table blocks, so tables render as real tables without a
// markdown-table dependency. Checklist items become ☐ / ☑. Code fences pass through untouched. Client-safe.

export type Block = { kind: "text"; text: string } | { kind: "table"; head: string[]; rows: string[][] };

/** Cells of a `| a | b |` row; a pipe inside `inline code` stays in its cell. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "", code = false;
  for (const ch of line.trim().replace(/^\|/, "").replace(/\|$/, "")) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);

export function splitBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let text: string[] = [];
  let fence = false;
  const flush = () => {
    if (text.length) blocks.push({ kind: "text", text: text.join("\n").replace(/^(\s*[-*] )\[ \] /gm, "$1☐ ").replace(/^(\s*[-*] )\[[xX]\] /gm, "$1☑ ") });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && isRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    text.push(line);
  }
  flush();
  return blocks.filter((b) => b.kind === "table" || b.text.trim().length > 0);
}

// The blog's markdown subset (templates/blog/README.md) to HTML, for the SEO page's preview. Escapes everything
// first, so a draft can never inject markup. Pure and client-safe.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const inline = (s: string) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');

export function blogHtml(md: string): string {
  const out: string[] = [];
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    if (/^###\s/.test(block)) out.push(`<h3>${inline(block.slice(4))}</h3>`);
    else if (/^##\s/.test(block)) out.push(`<h2>${inline(block.slice(3))}</h2>`);
    else if (lines.every((l) => /^-\s/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`);
    else if (lines.every((l) => /^\d+\.\s/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s/, ""))}</li>`).join("")}</ol>`);
    else if (lines.every((l) => /^>\s?/.test(l))) out.push(`<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>`);
    else if (lines.length >= 2 && lines.every((l) => /^\|.*\|$/.test(l.trim()))) {
      const cells = (l: string) => l.trim().slice(1, -1).split("|").map((c) => inline(c.trim()));
      out.push(`<table><thead><tr>${cells(lines[0]).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${lines.slice(2).map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else out.push(`<p>${inline(lines.join(" "))}</p>`);
  }
  return out.join("\n");
}

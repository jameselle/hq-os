#!/usr/bin/env node
// HQ's template blog publisher: "publishes" posts as HTML files into a local folder, so a business can run the
// whole daily blog (research, write, check, approve, publish, read back) before connecting a real site. It follows
// the contract in templates/blog/README.md. Copy it to $HQ_DATA/businesses/<slug>/blog-publisher.mjs and connect it
// with blog-connection.json: {"command": ["/path/to/node", "/path/to/blog-publisher.mjs", "/path/to/folder"]}.
// The read-back works only for a real site, so with this publisher posts stay "sent" until you serve the folder.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || path.join(process.cwd(), 'blog-out');
const base = process.argv[3] || 'https://example.com/blog/';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

/** The contract's markdown subset to HTML. */
export function toHtml(md) {
  const out = [];
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    if (/^###\s/.test(block)) out.push(`<h3>${inline(block.slice(4))}</h3>`);
    else if (/^##\s/.test(block)) out.push(`<h2>${inline(block.slice(3))}</h2>`);
    else if (lines.every((l) => /^-\s/.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`);
    else if (lines.every((l) => /^\d+\.\s/.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`);
    else if (lines.every((l) => /^>\s?/.test(l))) out.push(`<blockquote><p>${inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>`);
    else if (lines.length >= 2 && lines.every((l) => /^\|.*\|$/.test(l.trim()))) {
      const cells = (l) => l.trim().slice(1, -1).split('|').map((c) => inline(c.trim()));
      out.push(`<table><thead><tr>${cells(lines[0]).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${lines.slice(2).map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return out.join('\n');
}

async function main() {
  const req = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  fs.mkdirSync(dir, { recursive: true });
  const posts = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  if (req.action === 'list') return { posts: posts.map((p) => ({ slug: p.slug, title: p.title, url: p.url, publishedAt: p.publishedAt })) };
  if (req.action === 'publish') {
    const p = req.post ?? {};
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug ?? '')) throw Error('bad slug');
    if (posts.some((x) => x.slug === p.slug)) throw Error(`slug ${p.slug} already published`);
    const url = new URL(`${p.slug}/`, base).toString(), publishedAt = new Date().toISOString();
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.title)}</title><meta name="description" content="${esc(p.description)}"></head><body><article><h1>${esc(p.title)}</h1>\n${toHtml(p.markdown ?? '')}\n<h2>Sources</h2><ol>${(p.sources ?? []).map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ol></article></body></html>\n`;
    if (req.dryRun) return { url, html };
    fs.writeFileSync(path.join(dir, `${p.slug}.html`), html);
    fs.writeFileSync(path.join(dir, `${p.slug}.json`), JSON.stringify({ slug: p.slug, title: p.title, url, publishedAt }));
    return { url, publishedAt };
  }
  throw Error('unknown action');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((o) => process.stdout.write(JSON.stringify(o) + '\n'), (e) => { console.error(`folder publisher: ${String(e.message).slice(0, 120)}`); process.exitCode = 1; });
}

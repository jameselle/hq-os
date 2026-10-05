import { test } from "node:test";
import assert from "node:assert/strict";

import { blockedCrawlers } from "../lib/geo";
import { blogHtml } from "../lib/blog-html";

test("robots.txt: a site-wide disallow shuts crawlers out, their own group wins over *", () => {
  assert.deepEqual(blockedCrawlers("User-agent: *\nDisallow: /admin/\n"), []);
  assert.ok(blockedCrawlers("User-agent: *\nDisallow: /\n").includes("GPTBot"));
  const mixed = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\n";
  assert.deepEqual(blockedCrawlers(mixed), ["GPTBot"]);
  assert.deepEqual(blockedCrawlers("User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n").includes("ClaudeBot"), false);
});

test("the blog preview escapes everything and renders only the subset", () => {
  const html = blogHtml("Hi <script>x</script> **b** [l](https://a.example)\n\n## H\n\n- a\n- b");
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>b<\/strong>/);
  assert.match(html, /<a href="https:\/\/a.example" rel="noopener" target="_blank">l<\/a>/);
  assert.match(html, /<h2>H<\/h2>/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.ok(!blogHtml("[x](javascript:alert(1))").includes("href"));
});

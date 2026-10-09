#!/usr/bin/env node
// Engineering adapter: the pull requests merged in a time window, from the GitHub CLI (gh, already signed in).
// Read-only. Usage in engineering-connection.json:
//   { "command": ["/path/to/node", "/path/to/github-merged.mjs", "/path/to/engineering-github.json"], "readOnly": true }
// engineering-github.json: { "repos": [{ "repo": "owner/name", "area": "Web" }, …], "skipTitle": ["^chore", "^deps"] }
// HQ sends { "since": "<ISO>", "until": "<ISO>" } on stdin and reads { "shipped": [{ title, url, at, area }] }.
// Prints nothing else; a repo that fails is skipped and named on stderr, never with a token.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const until = input.until ? new Date(input.until) : new Date();
const since = input.since ? new Date(input.since) : new Date(until.getTime() - 7 * 864e5);
const skip = (config.skipTitle ?? []).map((p) => new RegExp(p, "i"));
const gh = [process.env.GH_BIN, path.join(os.homedir(), ".local", "bin", "gh"), "/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find((p) => p && fs.existsSync(p)) ?? "gh";

const shipped = [];
for (const { repo, area } of config.repos ?? []) {
  try {
    const out = execFileSync(gh, ["pr", "list", "-R", repo, "--state", "merged", "--search", `merged:>=${since.toISOString().slice(0, 10)}`, "--limit", "100", "--json", "title,url,mergedAt"],
      { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
    for (const pr of JSON.parse(out)) {
      const at = new Date(pr.mergedAt);
      if (at < since || at > until || skip.some((r) => r.test(pr.title))) continue;
      shipped.push({ title: String(pr.title).slice(0, 200), url: pr.url, at: at.toISOString(), area: String(area ?? repo).slice(0, 40) });
    }
  } catch { process.stderr.write(`engineering adapter: couldn't list ${repo}\n`); }
}
process.stdout.write(JSON.stringify({ shipped: shipped.slice(0, 200) }));

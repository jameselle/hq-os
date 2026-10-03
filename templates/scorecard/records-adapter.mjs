#!/usr/bin/env node
// A ready-made records adapter: a business's own signups, activation and membership history, from the
// totals-only function in records-postgres.sql. Use it on its own, or as `records.command` under the
// billing adapter so Stripe and the App Store are layered on top. Config (in the business's HQ data folder):
//   { "url": "https://<project>.supabase.co", "publicKey": "<the project's public anon key>",
//     "keychain": "hq-<business>-records", "function": "hq_scorecard" }
// The token is read from the login Keychain and never printed. Guide: docs/guides/scorecard-records.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fetchRecords } from './records-source.mjs';

const input = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s || '{}')); }));
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const token = execFileSync('/usr/bin/security', ['find-generic-password', '-s', config.keychain, '-w'], { encoding: 'utf8' }).trim();
const snapshot = await fetchRecords({ url: config.url, publicKey: config.publicKey, token, functionName: config.function, weeks: Math.min(Math.max(Number(input.weeks) || 12, 1), 26) });
process.stdout.write(JSON.stringify(snapshot) + '\n');

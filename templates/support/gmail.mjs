#!/usr/bin/env node
// Support mailbox reader (Gmail API, read-only scope): conversations sent to a business's support addresses, as a
// support snapshot (lib/support.ts). Subjects and snippets are read here, on this Mac, only to pick a theme; what
// leaves is references, themes, counts and timings. Never message text, names, addresses or ids.
//
//   node gmail.mjs report <config.json>            the snapshot on stdout (HQ's support adapter contract)
//   node gmail.mjs connect <mailbox> [--client f]  one-time sign-in for a mailbox; --client stores the OAuth client
//
// config.json: {"mailboxes": ["owner@example.com"], "addresses": ["support@example.com"], "ownAddresses": [], "ownDomains": []}
//   mailboxes     Gmail accounts to read (each signed in once with `connect`); mail to the addresses may be
//                 forwarded into any of them
//   addresses     the business's support addresses: a thread counts when a message went to or from one of them
//   ownAddresses  other senders that are the business (its lifecycle or no-reply sender), never customers. One of
//                 them sending to a support address with Reply-To a customer is a relayed form submission: it counts.
//   ownDomains    every address at these domains is the business (staff, senders you can't list one by one)
// Credentials: Keychain service hq-gmail-client (the OAuth client JSON) and hq-gmail / <mailbox> (refresh token).
// Guide: docs/guides/support-desk.md, "Support email".
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// ---- pure: themes, automated mail, the snapshot -------------------------------------------------------------

/** First match wins. Names match the database adapters' themes so the merged board reads as one. */
export const THEMES = [
  ['Cancel or refund', /\b(cancel+(ation|ing)?|refund|unsubscribe me|close my account|delete my account)\b/i],
  ['Billing and payments', /\b(bill(ing|ed)?|invoice|receipt|charge[ds]?|payment|card (was )?declined|subscription|price|pricing|plan upgrade)\b/i],
  ['Account and sign-in', /\b(log ?in|sign[ -]?in|password|verify|verification|sms|code|phone|api key|my key|account access|locked out)\b/i],
  ['Bug or broken', /\b(bug|broken|error|not working|doesn'?t work|isn'?t working|crash(es|ed)?|failing|fails|500|404|timeout)\b/i],
  ['Odds or data', /\b(odds|prices?|markets?|lines?|league|bookmaker|bookie|events?|props?|scores?|data|stale|missing)\b/i],
  ['Feature request', /\b(feature|could you add|can you add|would be (great|nice)|request(ing)? (a|an|that)|wish|suggest(ion)?|support for)\b/i],
  ['Partnership or press', /\b(partner(ship)?|affiliate|sponsor|collab(oration)?|press|interview|podcast|advertis(e|ing))\b/i],
  ['How do I', /\b(how (do|can|to)|where (do|can|is)|is it possible|help with|question)\b/i],
];
export function themeOf(text) {
  const t = String(text ?? '');
  for (const [name, re] of THEMES) if (re.test(t)) return name;
  return 'Other';
}

const header = (m, name) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
export const addressOf = (v) => (String(v).match(/<([^>]+)>/)?.[1] ?? String(v)).trim().toLowerCase();
const listOf = (v) => String(v).split(',').map(addressOf).filter((a) => a.includes('@'));

/** Mail no person wrote: lists, auto-replies, bounces and notification senders. */
export function automated(m) {
  const from = addressOf(header(m, 'From'));
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|alerts?|news(letter)?)[@+.-]/i.test(from)) return true;
  if (header(m, 'List-Unsubscribe') || header(m, 'List-Id')) return true;
  if (/^(bulk|list|junk)$/i.test(header(m, 'Precedence'))) return true;
  const auto = header(m, 'Auto-Submitted');
  return Boolean(auto) && auto.toLowerCase() !== 'no';
}

/** Gmail search for threads touching any support address, within the window. */
export function buildQuery(addresses, days = 90) {
  const any = addresses.flatMap((a) => [`to:${a}`, `cc:${a}`, `deliveredto:${a}`, `from:${a}`]);
  return `newer_than:${days}d -in:chats {${any.join(' ')}}`;
}

/** A link that opens the same search in the mailbox (path and fragment only: no query string). */
export const answerLink = (mailbox, addresses) =>
  `https://mail.google.com/mail/u/${encodeURIComponent(mailbox)}/#search/${encodeURIComponent(addresses.map((a) => `to:${a}`).join(' OR '))}`;

const isoWeek = (t) => {
  const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
};
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** threads: [{mailbox, thread}] as the Gmail API returns them (format=metadata). Pure; `now` for tests.
 * @param {{mailbox: string, thread: any}[]} threads
 * @param {{addresses: string[], mailboxes: string[], ownAddresses?: string[], ownDomains?: string[], missing?: string[]}} cfg
 * @param {number} [now] */
export function snapshotFrom(threads, { addresses, mailboxes, ownAddresses = [], ownDomains = [], missing = [] }, now = Date.now()) {
  const ownSet = new Set([...addresses, ...mailboxes, ...ownAddresses].map((a) => a.toLowerCase()));
  const domains = ownDomains.map((d) => '@' + d.toLowerCase().replace(/^@/, ''));
  const own = { has: (a) => ownSet.has(a) || domains.some((d) => a.endsWith(d)) };
  const support = new Set(addresses.map((a) => a.toLowerCase()));
  const seen = new Set(), conversations = [];
  for (const { mailbox, thread } of threads) {
    const msgs = (thread.messages ?? []).filter((m) => !(m.labelIds ?? []).some((l) => l === 'SPAM' || l === 'TRASH' || l === 'DRAFT'))
      .sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
    // A form submission the business relays to its support address: sent by the business, Reply-To the customer.
    const relayed = (m) => !(m.labelIds ?? []).includes('SENT') && own.has(addressOf(header(m, 'From')))
      && Boolean(header(m, 'Reply-To')) && !own.has(addressOf(header(m, 'Reply-To')))
      && [...listOf(header(m, 'To')), ...listOf(header(m, 'Delivered-To'))].some((a) => support.has(a));
    const mine = (m) => !relayed(m) && ((m.labelIds ?? []).includes('SENT') || own.has(addressOf(header(m, 'From'))));
    const touchesSupport = msgs.some((m) => [...listOf(header(m, 'To')), ...listOf(header(m, 'Cc')), ...listOf(header(m, 'Delivered-To')), addressOf(header(m, 'From'))].some((a) => support.has(a)));
    if (!touchesSupport) continue;
    const human = (m) => relayed(m) || (!mine(m) && !automated(m));
    const firstIn = msgs.findIndex(human);
    if (firstIn < 0) continue;
    // The same conversation can sit in two mailboxes (forwarded and delivered): count it once, by its first message.
    const key = header(msgs[firstIn], 'Message-ID') || `${addressOf(header(msgs[firstIn], 'From'))}|${msgs[firstIn].internalDate}`;
    if (seen.has(key)) continue; seen.add(key);
    const openedAt = Number(msgs[firstIn].internalDate);
    const reply = msgs.slice(firstIn + 1).find(mine);
    const lastMine = msgs.map(mine).lastIndexOf(true);
    const after = msgs.slice(lastMine + 1).filter(human);
    const last = msgs.at(-1);
    conversations.push({
      ref: 'e-' + createHash('sha256').update(`${mailbox}:${thread.id}`).digest('hex').slice(0, 8),
      mailbox, theme: themeOf(`${header(msgs[firstIn], 'Subject')} ${msgs[firstIn].snippet ?? ''}`),
      openedFrom: relayed(msgs[firstIn]) ? 'the website contact form' : msgs.slice(0, firstIn).some(mine) ? 'a reply to one of our emails' : 'a new email',
      openedAt, replyHours: reply ? (Number(reply.internalDate) - openedAt) / 3600e3 : null,
      waiting: after.length > 0 && !mine(last), unread: after.length, lastAt: Number(last.internalDate),
    });
  }
  const recent = conversations.filter((c) => c.openedAt >= now - 90 * DAY);
  const themes = {};
  for (const c of recent) themes[c.theme] = (themes[c.theme] ?? 0) + 1;
  const weeks = new Map();
  for (const c of recent) {
    const w = weeks.get(isoWeek(c.openedAt)) ?? { opened: 0, answered: 0, hours: [] };
    w.opened++; if (c.replyHours !== null) { w.answered++; w.hours.push(c.replyHours); }
    weeks.set(isoWeek(c.openedAt), w);
  }
  const link = mailboxes.length ? answerLink(mailboxes[0], addresses) : undefined;
  return {
    version: 1, observedAt: new Date(now).toISOString(),
    ...(link ? { answerAt: link } : {}),
    channels: ['Support email'],
    blind: [
      'Email customers send to a personal address rather than a support address',
      ...(missing.length ? [`${missing.length} configured mailbox${missing.length > 1 ? 'es aren’t' : ' isn’t'} signed in yet (support-desk guide, "Support email")`] : []),
    ],
    waiting: recent.filter((c) => c.waiting).sort((a, b) => a.lastAt - b.lastAt).slice(0, 200).map((c) => ({
      ref: c.ref, channel: 'Email', theme: c.theme, openedFrom: c.openedFrom,
      openedAt: new Date(c.openedAt).toISOString(), lastAt: new Date(c.lastAt).toISOString(), unread: c.unread,
      ...(mailboxes.length > 1 && c.mailbox !== mailboxes[0] ? { answerAt: answerLink(c.mailbox, addresses) } : {}),
    })),
    themes,
    weekly: [...weeks].sort(([a], [b]) => a.localeCompare(b)).slice(-13)
      .map(([week, w]) => ({ week, opened: w.opened, answered: w.answered, medianReplyHours: w.hours.length ? Math.round(median(w.hours) * 10) / 10 : null })),
  };
}

// ---- Keychain and the Gmail API ------------------------------------------------------------------------------

const keychainRead = (service, account) => {
  try { return execFileSync('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};
/** Through `security -i` on stdin, so the secret never appears in a process list. */
const keychainWrite = (service, account, secret) => {
  const q = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;
  execFileSync('/usr/bin/security', ['-i'], { input: `add-generic-password -U -s ${q(service)} -a ${q(account)} -w ${q(secret)}\n`, stdio: ['pipe', 'ignore', 'inherit'] });
};
const client = () => { const raw = keychainRead('hq-gmail-client', 'oauth-client'); return raw ? JSON.parse(raw) : null; };

async function accessToken(mailbox) {
  const c = client(), refresh = keychainRead('hq-gmail', mailbox);
  if (!c || !refresh) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: refresh, grant_type: 'refresh_token' }) });
  if (!r.ok) throw Error(`token refresh for a mailbox failed: HTTP ${r.status}`);
  return (await r.json()).access_token;
}

async function gmail(token, path, params = {}) {
  const u = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`);
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) u.searchParams.append(k, x);
  const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error(`Gmail ${path.split('/')[0]}: HTTP ${r.status}`);
  return r.json();
}

async function report(configPath) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const { mailboxes = [], addresses = [] } = cfg;
  if (!mailboxes.length || !addresses.length) throw Error('config needs mailboxes and addresses');
  const threads = [], missing = [], connected = [];
  for (const mailbox of mailboxes) {
    const token = await accessToken(mailbox);
    if (!token) { missing.push(mailbox); continue; }
    connected.push(mailbox);
    let pageToken, ids = [];
    do {
      const page = await gmail(token, 'threads', { q: buildQuery(addresses), maxResults: 100, ...(pageToken ? { pageToken } : {}) });
      ids.push(...(page.threads ?? []).map((t) => t.id)); pageToken = page.nextPageToken;
    } while (pageToken && ids.length < 1000);
    for (const id of ids) threads.push({ mailbox, thread: await gmail(token, `threads/${id}`, { format: 'metadata', metadataHeaders: ['From', 'Reply-To', 'To', 'Cc', 'Delivered-To', 'Subject', 'Message-ID', 'List-Unsubscribe', 'List-Id', 'Precedence', 'Auto-Submitted'] }) });
  }
  if (!connected.length) throw Error('no configured mailbox is signed in: run `node gmail.mjs connect <mailbox>`');
  return snapshotFrom(threads, { ...cfg, mailboxes: connected, missing });
}

async function connect(mailbox, clientFile) {
  if (clientFile) {
    const j = JSON.parse(readFileSync(clientFile, 'utf8')), c = j.installed ?? j.web;
    if (!c?.client_id || !c?.client_secret) throw Error('That file is not a Google OAuth client (Desktop app) JSON');
    keychainWrite('hq-gmail-client', 'oauth-client', JSON.stringify({ client_id: c.client_id, client_secret: c.client_secret }));
    console.log('Stored the OAuth client in the Keychain (hq-gmail-client). You can delete the downloaded file.');
  }
  const c = client();
  if (!c) throw Error('No OAuth client yet: run again with --client <the downloaded client_secret JSON>');
  const verifier = randomBytes(32).toString('base64url'), state = randomBytes(16).toString('hex');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(ok ? 'HQ can read this mailbox (read-only). You can close this tab.' : 'Sign-in did not complete. Close this tab and run the command again.');
      server.close(); ok ? resolve({ code: u.searchParams.get('code'), port: server.address()?.port ?? port }) : reject(Error(u.searchParams.get('error') ?? 'sign-in refused'));
    });
    let port;
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [k, v] of Object.entries({ client_id: c.client_id, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code', scope: SCOPE,
        access_type: 'offline', prompt: 'consent', login_hint: mailbox, state, code_challenge: challenge, code_challenge_method: 'S256' })) auth.searchParams.set(k, v);
      console.log(`Opening Google sign-in for ${mailbox} (read-only). If no browser opens, visit:\n${auth}`);
      spawn('/usr/bin/open', [auth.toString()], { stdio: 'ignore', detached: true }).unref();
    });
    setTimeout(() => { server.close(); reject(Error('timed out after 5 minutes')); }, 300000).unref();
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, code: code.code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: `http://127.0.0.1:${code.port}` }) });
  if (!r.ok) throw Error(`token exchange failed: HTTP ${r.status}`);
  const t = await r.json();
  if (!t.refresh_token) throw Error('Google returned no refresh token; remove HQ under myaccount.google.com/permissions and run again');
  const who = (await gmail(t.access_token, 'profile')).emailAddress?.toLowerCase();
  if (who !== mailbox.toLowerCase()) throw Error(`signed in as a different account than ${mailbox}; run again and pick ${mailbox}`);
  keychainWrite('hq-gmail', mailbox, t.refresh_token);
  console.log(`Connected ${mailbox}, read-only. The token is in the Keychain (hq-gmail).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, a, ...rest] = process.argv.slice(2);
  const run = cmd === 'report' && a ? report(a).then((s) => process.stdout.write(JSON.stringify(s) + '\n'))
    : cmd === 'connect' && a ? connect(a, rest[0] === '--client' ? rest[1] : undefined)
    : Promise.reject(Error('usage: gmail.mjs report <config.json> | connect <mailbox> [--client <client_secret.json>]'));
  run.catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}

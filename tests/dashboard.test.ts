import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {dashboardProblems, fillDays, personalise, planOf, rollUp, sumSince, countBy, type DashboardSnapshot} from '../lib/dashboard';
import {addDashboardNote, dashboardNotes, forgetDashboard, getDashboard, peekDashboard, setDashboardContact} from '../lib/dashboard-store';

const DEMO = path.resolve('templates/dashboard/dashboard-template.mjs');

function withBusiness(fn: (dir: string, slug: string) => Promise<void>) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-dashboard-')), old = process.env.HQ_DATA;
    process.env.HQ_DATA = dir;
    const slug = 'demo-shop';
    fs.mkdirSync(path.join(dir, 'businesses', slug), {recursive: true});
    fs.writeFileSync(path.join(dir, 'businesses', slug, 'profile.json'), JSON.stringify({slug, name: 'Demo Shop', country: 'AU', currency: 'AUD', timezone: 'Australia/Sydney', offer: 'Example', audience: 'Example', model: 'subscription', sites: [], channels: {}, regulated: [], vault: {path: 'vault'}, createdAt: '2026-01-01'}));
    forgetDashboard();
    try { await fn(dir, slug); } finally { forgetDashboard(); process.env.HQ_DATA = old; fs.rmSync(dir, {recursive: true, force: true}); }
  };
}

const connect = (dir: string, slug: string, extra: string[] = [], readOnly = false) =>
  fs.writeFileSync(path.join(dir, 'businesses', slug, 'dashboard-connection.json'), JSON.stringify({command: [process.execPath, DEMO, ...extra], readOnly}));

/** Every file under a folder, so a test can prove nothing about a customer was written. */
const allFiles = (d: string): string[] => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => (e.isDirectory() ? allFiles(path.join(d, e.name)) : [path.join(d, e.name)]));

test('the demo snapshot is valid and every section is present', withBusiness(async (dir, slug) => {
  connect(dir, slug);
  const {snapshot: s} = await getDashboard(slug);
  assert.deepEqual(dashboardProblems(s), []);
  assert.ok(s.plans!.some((p) => p.paid) && s.plans!.some((p) => !p.paid));
  assert.ok(s.daily!.signups.length > 30 && s.daily!.upgrades.length > 0);
  assert.ok(s.recentUpgrades!.length && s.churned!.length && s.pending!.length && s.orphaned?.length);
  assert.ok(s.security);
  for (const r of [...s.churned!, ...s.pending!]) assert.ok(r.template && s.templates![r.template], `${r.key} has a template`);
}));

test('customer details are never written to disk', withBusiness(async (dir, slug) => {
  connect(dir, slug);
  const before = allFiles(dir).sort();
  const {snapshot} = await getDashboard(slug);
  await getDashboard(slug, {force: true});
  assert.deepEqual(allFiles(dir).sort(), before, 'no new files');
  const text = allFiles(dir).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const r of snapshot.churned!) assert.ok(!text.includes(r.email!), 'no email on disk');
}));

test('a fresh snapshot is served from memory; force and expiry read again', withBusiness(async (dir, slug) => {
  connect(dir, slug);
  const first = await getDashboard(slug);
  const again = await getDashboard(slug);
  assert.equal(again.snapshot, first.snapshot);
  assert.ok(peekDashboard(slug));
  assert.equal(peekDashboard(slug, Date.now() + 61_000), null);
  const forced = await getDashboard(slug, {force: true});
  assert.notEqual(forced.snapshot, first.snapshot);
}));

test('contact status and notes go through the adapter, by a key the dashboard showed', withBusiness(async (dir, slug) => {
  connect(dir, slug, [path.join(dir, 'businesses', slug, 'dashboard-demo.json')]);
  await assert.rejects(setDashboardContact(slug, 'churned-1', 'contacted'), /Load the dashboard first/);
  await getDashboard(slug);
  await setDashboardContact(slug, 'churned-1', 'contacted');
  assert.equal((await getDashboard(slug)).snapshot.churned!.find((r) => r.key === 'churned-1')!.contact, 'contacted');
  assert.equal((await getDashboard(slug, {force: true})).snapshot.churned!.find((r) => r.key === 'churned-1')!.contact, 'contacted');
  await assert.rejects(setDashboardContact(slug, 'churned-1', 'emailed'), /Unknown contact status/);
  await assert.rejects(setDashboardContact(slug, 'someone-else', 'contacted'), /not on the dashboard/);
  await assert.rejects(addDashboardNote(slug, 'pending-1', '   '), /Write a note first/);
  await assert.rejects(addDashboardNote(slug, 'pending-1', 'x'.repeat(2001)), /under 2000/);
  await addDashboardNote(slug, 'pending-1', 'Called, will think about it');
  await addDashboardNote(slug, 'pending-1', 'Sent the feature email');
  const notes = await dashboardNotes(slug, 'pending-1');
  assert.deepEqual(notes.map((x) => x.note), ['Sent the feature email', 'Called, will think about it']);
}));

test('a read-only connection can show the dashboard but change nothing', withBusiness(async (dir, slug) => {
  connect(dir, slug, [], true);
  const {snapshot} = await getDashboard(slug);
  assert.deepEqual(snapshot.can, {contact: false, notes: false});
  await assert.rejects(setDashboardContact(slug, 'churned-1', 'contacted'), /read-only/);
  await assert.rejects(addDashboardNote(slug, 'churned-1', 'hello'), /no notes/);
}));

test('a snapshot carrying a key or token is refused, naming the problem not the value', withBusiness(async (dir, slug) => {
  const bad = {observedAt: new Date().toISOString(), leak: 'sk_live_' + 'a'.repeat(24)};
  fs.writeFileSync(path.join(dir, 'businesses', slug, 'dashboard-connection.json'), JSON.stringify({command: [process.execPath, '-e', `process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(bad))}))`]}));
  await assert.rejects(getDashboard(slug), (e: Error) => /key or token/.test(e.message) && !e.message.includes('sk_live'));
}));

test('the validator checks every section by path', () => {
  assert.deepEqual(dashboardProblems(null), ['snapshot must be an object']);
  const s = {observedAt: 'soon', plans: [{id: 'a'}], totalUsers: -1, signups: {}, daily: {since: 'x', signups: [], upgrades: [{date: '2026-01-01', count: 1.5}]},
    recentUpgrades: [], churned: [{key: 'a', name: null, email: null, churnedAt: '2026-01-01', source: 'fax', contact: 'contacted'}, {key: 'a'}],
    pending: 'none', security: null, orphaned: null, templates: {x: {label: 'x'}}, can: {}};
  const out = dashboardProblems(s).join('\n');
  for (const want of ['observedAt', 'plans[0]', 'totalUsers', 'signups', 'daily.since', 'daily.upgrades', 'churned[0].source', 'churned[1].key is repeated', 'pending must be a list', 'templates.x', 'can needs'])
    assert.ok(out.includes(want), want);
});

test('days roll up by Monday-start week and by month, and gaps fill with zero', () => {
  const days = [{date: '2026-09-27', count: 1}, {date: '2026-09-28', count: 2}, {date: '2026-10-04', count: 3}, {date: '2026-10-05', count: 4}];
  assert.deepEqual(rollUp(days, 'weekly'), [{date: '2026-09-21', count: 1}, {date: '2026-09-28', count: 5}, {date: '2026-10-05', count: 4}]);
  assert.deepEqual(rollUp(days, 'monthly'), [{date: '2026-09', count: 3}, {date: '2026-10', count: 7}]);
  assert.equal(rollUp(days, 'daily'), days);
  const filled = fillDays([{date: '2026-10-02', count: 5}], '2026-10-01', '2026-10-03');
  assert.deepEqual(filled, [{date: '2026-10-01', count: 0}, {date: '2026-10-02', count: 5}, {date: '2026-10-03', count: 0}]);
  assert.equal(sumSince(days, '2026-10-01'), 7);
});

test('templates take the first name, and plans and counts group rows', () => {
  const t = {label: 'x', subject: 'Hi {{first_name}}', body: 'Dear {{first_name}}, {{first_name}}'};
  assert.deepEqual(personalise(t, 'Maya Lin'), {subject: 'Hi Maya', body: 'Dear Maya, Maya'});
  assert.equal(personalise(t, null).body, 'Dear there, there');
  const plans = [{id: 'gold', label: 'Gold', count: 1, paid: true}, {id: 'bronze', label: 'Bronze', count: 1, paid: false}];
  assert.equal(planOf('App Store gold monthly', plans), 'gold');
  assert.equal(planOf('Bronze', plans), 'other');
  assert.deepEqual(countBy(['a', 'b', 'a'], (x) => x), {all: 3, a: 2, b: 1});
});

test('the snapshot type and the demo agree on shape', async () => {
  const {execFileSync} = await import('node:child_process');
  const s = JSON.parse(execFileSync(process.execPath, [DEMO], {input: '{"action":"report"}', encoding: 'utf8'})) as DashboardSnapshot;
  assert.deepEqual(dashboardProblems(s), []);
});

test('a business without members reports tiles, charts and lists only', () => {
  const s = {observedAt: new Date().toISOString(), can: {contact: false, notes: false},
    groups: [{id: 'audience', title: 'Audience', tiles: [{label: 'Followers', value: 120}, {label: 'Reach', value: null, hint: 'not answering'}, {label: 'Sales', value: 12.5, format: 'money', currency: 'usd'}]}],
    charts: [{id: 'posts', title: 'Posts', kind: 'bars', since: '2026-10-01', points: [{date: '2026-10-02', count: 2}]}],
    lists: [{id: 'leads', title: 'Leads', rows: [{key: 'a', title: '@someone', tags: ['day-1'], at: '2026-10-02T00:00:00Z', link: 'https://example.com/a'}]}]};
  assert.deepEqual(dashboardProblems(s), []);
  const bad = {...s, groups: [{id: 'audience', title: 'A', tiles: [{label: 'x', value: '3'}]}], charts: [{id: 'audience', title: 'P', kind: 'pie', since: 'x', points: []}],
    lists: [{id: 'l', title: 'L', rows: [{key: 'a', title: 'x', link: 'http://plain'}]}], errors: {x: 3}};
  const out = dashboardProblems(bad).join('\n');
  for (const want of ['groups[0].tiles[0]', 'charts[0].id is repeated', 'charts[0] needs', 'lists[0].rows[0].link', 'errors must map']) assert.ok(out.includes(want), want);
});

test('tile values read as words, unknown as a dash', async () => {
  const {tileText} = await import('../lib/dashboard');
  assert.equal(tileText({label: 'x', value: null}), '–');
  assert.equal(tileText({label: 'x', value: 1234}), '1,234');
  assert.equal(tileText({label: 'x', value: 0.125, format: 'percent'}), '12.5%');
  assert.equal(tileText({label: 'x', value: 12.5, format: 'money', currency: 'usd'}), 'USD $12.50');
});

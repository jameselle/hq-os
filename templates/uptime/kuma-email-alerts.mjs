#!/usr/bin/env node
// Uptime Kuma email alerts through Resend, set up from the command line. Logs in to the local Kuma with the admin
// password from the Keychain (hq-uptime-kuma / admin), reads the Resend API key from the Keychain at run time (never
// printed or written anywhere), and adds one "Email" notification that's on by default and applied to every
// monitor. Re-running updates it in place. --check only logs in and lists monitors and notifications.
//
//   node kuma-email-alerts.mjs --check
//   node kuma-email-alerts.mjs --to you@example.com --from alerts@example.com [--from-name "HQ uptime"] \
//        [--key-service hq-resend-alerts --key-account default] [--test]
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const KUMA = opt("--kuma-dir", path.join(os.homedir(), ".local", "opt", "uptime-kuma"));
const { io } = createRequire(path.join(KUMA, "package.json"))("socket.io-client");
const keychain = (service, account) => execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" }).trim();
const NAME = "Email alerts (HQ)";

const socket = io(opt("--url", "http://127.0.0.1:3001"), { transports: ["websocket"], reconnection: false, timeout: 10000 });
const emit = (ev, ...a) => new Promise((res) => socket.emit(ev, ...a, res));
const lists = { monitors: null, notifications: null };
socket.on("monitorList", (m) => { lists.monitors = m; });
socket.on("notificationList", (n) => { lists.notifications = n; });
const fail = (why) => { console.error(`kuma-email-alerts: ${why}`); socket.close(); process.exit(1); };
socket.on("connect_error", (e) => fail(`can't reach Kuma: ${e.message}`));

socket.on("connect", async () => {
  const login = await emit("login", { username: opt("--user", "admin"), password: keychain("hq-uptime-kuma", opt("--user", "admin")), token: "" });
  if (!login?.ok) return fail(`login failed: ${login?.msg ?? "no reason given"}`);
  for (let i = 0; i < 50 && (lists.monitors === null || lists.notifications === null); i++) await new Promise((r) => setTimeout(r, 100));
  const monitors = Object.values(lists.monitors ?? {}), notes = lists.notifications ?? [];
  console.log(`logged in · ${monitors.length} monitors: ${monitors.map((m) => m.name).join(", ")}`);
  console.log(`notifications: ${notes.length ? notes.map((n) => `${n.name}${n.isDefault ? " (default)" : ""}`).join(", ") : "none"}`);
  if (args.includes("--check")) { socket.close(); return; }

  const to = opt("--to"), from = opt("--from");
  if (!to || !from) return fail("--to and --from are required");
  let key;
  try { key = keychain(opt("--key-service", "hq-resend-alerts"), opt("--key-account", "default")); }
  catch { return fail(`no Resend key in the Keychain item ${opt("--key-service", "hq-resend-alerts")}`); }
  const existing = notes.find((n) => n.name === NAME);
  const notification = {
    name: NAME, type: "Resend", isDefault: true, applyExisting: true,
    resendApiKey: key, resendFromEmail: from, resendFromName: opt("--from-name", "HQ uptime"), resendToEmail: to,
    resendSubject: opt("--subject", "Uptime alert"),
  };
  if (args.includes("--test")) {
    const t = await emit("testNotification", notification);
    if (!t?.ok) return fail(`test email failed: ${t?.msg ?? "no reason given"}`);
    console.log(`test email sent to ${to}`);
  }
  const r = await emit("addNotification", notification, existing?.id ?? null);
  if (!r?.ok) return fail(`couldn't save the notification: ${r?.msg ?? "no reason given"}`);
  console.log(`${existing ? "updated" : "added"} "${NAME}": on by default, applied to all ${monitors.length} monitors, to ${to}`);
  socket.close();
});

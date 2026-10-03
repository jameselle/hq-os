// Runs a business's private adapter: an owner-configured command in $HQ_DATA that prints JSON.
// Shared by the lifecycle and scorecard features. Commands come from the business's own
// connection file on disk, never from a request; credentials never travel in arguments.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {businessDir, getProfile} from './store';

export type PrivateConnection = {command: string[]; readOnly?: boolean};

export function readConnection(slug: string, connectionFile: string): PrivateConnection {
  if (!getProfile(slug)) throw Error('Unknown business');
  const config = JSON.parse(fs.readFileSync(path.join(businessDir(slug), connectionFile), 'utf8'));
  if (!Array.isArray(config.command) || !config.command.length || !config.command.every((s: unknown) => typeof s === 'string')) throw Error('Invalid private connection');
  return config;
}

export function execAdapter(command: string[], input: object, timeoutMs = 45000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const child = execFile(command[0], command.slice(1), {timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024}, (err, stdout) => {
      if (err) return done(() => reject(Error('Private adapter failed')));
      try { const value = JSON.parse(stdout); done(() => resolve(value)); } catch { done(() => reject(Error('Private adapter failed'))); }
    });
    // An adapter that ignores signals, or a grandchild holding stdout open, must not hang the refresh.
    const timer = setTimeout(() => done(() => { child.kill('SIGKILL'); reject(Error('Private adapter timed out')); }), timeoutMs + 1000);
    child.stdin?.end(JSON.stringify(input));
  });
}

export async function runPrivateAdapter(slug: string, connectionFile: string, input: object) {
  const config = readConnection(slug, connectionFile);
  return {config, output: await execAdapter(config.command, input)};
}

/** Atomic write, owner-only. */
export function writePrivateJson(file: string, value: unknown) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value), {mode: 0o600});
  fs.renameSync(tmp, file);
}

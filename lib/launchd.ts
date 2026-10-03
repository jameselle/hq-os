// Reading launchd job state. Client-safe: no node imports (status.ts runs launchctl and passes the output here).

/** launchctl print's output for a job: running only when it says "state = running". */
export function launchdRunning(printed: string): boolean {
  return /^\s*state = running\s*$/m.test(printed);
}

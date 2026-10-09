"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Re-runs the server component on an interval so the page stays live. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

/** A check-strip button in the HQ style. */
export function RecheckButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      className="rounded-lg border border-bb-border px-3 py-1.5 text-left hover:bg-bb-surface disabled:opacity-40 disabled:cursor-default"
    >
      <span className="block text-[12px] text-bb-fg/90">{pending ? "Checking…" : "Re-check"}</span>
      <span className="block text-[9.5px] text-bb-dim">ports, installs, skills</span>
    </button>
  );
}

/** Copies a Claude Code command so the operator can paste it in a session. */
export function CopyCommand({ command, label, blurb }: { command: string; label: string; blurb: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the command is visible in the blurb anyway.
        }
      }}
      className="rounded-lg border border-bb-border px-3 py-1.5 text-left hover:bg-bb-surface"
    >
      <span className="block text-[12px] text-bb-fg/90">{copied ? "Copied" : label}</span>
      <span className="block text-[9.5px] text-bb-dim font-mono">{blurb}</span>
    </button>
  );
}

/** Marks a CEO finding done for a business (it drops off the list). */
export function DoneButton({ business, id }: { business: string | null; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/findings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ business, id, done: true }),
          });
          router.refresh();
        })
      }
      className="ml-auto rounded-md border border-bb-border px-2 py-0.5 text-[10.5px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface disabled:opacity-40"
    >
      {pending ? "…" : "Mark done"}
    </button>
  );
}

/** Copies a block of text (an outreach draft) for the owner to paste and send themselves. */
export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the text is on the page to select by hand.
        }
      }}
      className="shrink-0 rounded-md border border-bb-border px-2 py-0.5 text-[11px] text-bb-muted hover:text-bb-fg hover:bg-bb-surface"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

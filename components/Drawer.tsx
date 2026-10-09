"use client";

// A panel that slides in from the right over the page: Escape, the backdrop or ✕ closes it, focus moves to ✕ on open
// and back to whatever opened it on close. The header (eyebrow, title, anything under it) and the body are the
// caller's.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Drawer({ eyebrow, title, head, onClose, children, labelId }: { eyebrow: ReactNode; title: ReactNode; head?: ReactNode; onClose: () => void; children: ReactNode; labelId: string }) {
  const [shown, setShown] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setShown(true));
    close.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); opener?.focus(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40">
      <div className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-bb-border bg-bb-surface shadow-glow transition-transform duration-200 ${shown ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-bb-border px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">{eyebrow}</div>
            <h2 id={labelId} className="text-[16px] font-semibold">{title}</h2>
            {head}
          </div>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-bb-muted hover:bg-bb-surface2 hover:text-bb-fg">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}

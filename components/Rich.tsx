// Renders `backticked` spans in finding text as inline code, nothing else.
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="font-mono text-[0.92em] text-bb-fg/90 bg-bb-surface2 border border-bb-border rounded px-1 py-px">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

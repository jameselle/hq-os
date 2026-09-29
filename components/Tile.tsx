// The HQ stat tile.
export function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "warn" }) {
  const valueTone = tone === "danger" ? "text-bb-danger" : tone === "warn" ? "text-bb-warn" : "";
  return (
    <div className="card px-3.5 py-3">
      <div className="text-[9.5px] uppercase tracking-[0.14em] font-mono text-bb-dim">{label}</div>
      <div className={`text-[20px] font-semibold tabular-nums mt-0.5 ${valueTone}`}>{value}</div>
      {hint && <div className="text-[10.5px] text-bb-muted mt-0.5">{hint}</div>}
    </div>
  );
}

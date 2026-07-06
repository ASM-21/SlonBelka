// Small shared visual pieces for the reskin.

/**
 * Striped placeholder reserving space for the slon + belka mascot art, sized
 * per the design handoff so the artwork can drop in later without reflow.
 */
export function MascotPlaceholder({
  label = "slon + belka",
  width = 150,
  height = 118,
}: {
  label?: string;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        background: "repeating-linear-gradient(45deg, var(--sb-line) 0 8px, #f0ece4 8px 16px)",
      }}
      className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-sb-line"
    >
      <span className="font-mono text-[11px] text-sb-muted">[ mascot ]</span>
      <span className="font-mono text-[10px] text-sb-muted opacity-70">{label}</span>
    </div>
  );
}

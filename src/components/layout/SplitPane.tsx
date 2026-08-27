import type { ReactNode } from "react";

// Two-pane asymmetric layout (list+form, content+sidebar). Separate from
// TileGrid (2 fixed named children vs. an N-item repeat) for a clearer API.
export function SplitPane({
  ratio = "1.6fr 1fr",
  gap = 16,
  left,
  right,
}: {
  ratio?: string;
  gap?: number;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: ratio, gap, alignItems: "start" }}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

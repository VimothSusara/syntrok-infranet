import type { CSSProperties, ReactNode } from "react";

// An N-item repeat grid — stat tiles (MetricCard/StatCard) or entity cards
// (project cards). Kept separate from SplitPane (2 fixed named panes,
// ratio-based) since they're structurally different shapes.
export function TileGrid({
  columns,
  gap = 14,
  style,
  children,
}: {
  columns: number;
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap, ...style }}>{children}</div>
  );
}

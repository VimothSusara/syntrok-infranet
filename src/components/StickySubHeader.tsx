import type { ReactNode } from "react";
import { H5 } from "@blueprintjs/core";

// A smaller sticky header for content nested inside a page that already has
// its own PageHeader — used by per-connector-type pages (EnvironmentSsh,
// EnvironmentWhm, ...) so each stays pinned to the top of its own scrolling
// pane, directly under the outer PageHeader, while the list below it scrolls.
export function StickySubHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "var(--bp-surface-background-color-default-rest)",
        paddingBottom: 12,
        marginBottom: 8,
      }}
    >
      <H5 style={{ margin: 0 }}>{title}</H5>
      {actions}
    </div>
  );
}

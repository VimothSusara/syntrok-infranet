import type { ReactNode } from "react";
import { Classes } from "@blueprintjs/core";
import classNames from "clsx";

// The "centered full-height dark shell" used for loading/error states —
// previously hand-copied identically in AppLayout, ErrorBoundary, and
// RouteErrorBoundary.
export function CenteredShell({ dark, children }: { dark: boolean; children: ReactNode }) {
  return (
    <div
      className={classNames("app-shell", { [Classes.DARK]: dark })}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "var(--bp-surface-background-color-default-rest)",
      }}
    >
      {children}
    </div>
  );
}

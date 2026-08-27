import type { ReactNode } from "react";
import { Card } from "@blueprintjs/core";
import { StickySubHeader } from "../StickySubHeader";

// Shell for a single-form create/edit page. Fixes a real bug found in the
// original hand-rolled versions of this: they used `minWidth` + `width:
// "100%"`, which stretches the card edge-to-edge on a wide window instead
// of reading as a form — this uses `maxWidth` instead.
export function FormPageShell({
  title,
  maxWidth = 640,
  children,
}: {
  title: string;
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <div>
      <StickySubHeader title={title} />
      <Card style={{ maxWidth, width: "100%" }}>{children}</Card>
    </div>
  );
}

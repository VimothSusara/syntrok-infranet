import { Card, Classes } from "@blueprintjs/core";
import type { UsageIntent } from "../lib/format";

const INTENT_COLORS: Record<UsageIntent | "none", string> = {
  success: "var(--app-text-success)",
  warning: "var(--app-text-warning)",
  danger: "var(--app-text-danger)",
  none: "var(--app-text-accent)",
};

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  percent?: number;
  intent?: UsageIntent | "none";
}

export function MetricCard({
  label,
  value,
  subtext,
  percent,
  intent = "none",
}: MetricCardProps) {
  return (
    <Card>
      <div
        className={Classes.TEXT_MUTED}
        style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: 22, fontWeight: 600, marginBottom: subtext ? 2 : 8 }}
      >
        {value}
      </div>
      {subtext && (
        <div
          className={Classes.TEXT_MUTED}
          style={{ fontSize: 12, marginBottom: 8 }}
        >
          {subtext}
        </div>
      )}
      {percent !== undefined && (
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "var(--bp-surface-border-color-default)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, percent))}%`,
              background: INTENT_COLORS[intent],
              borderRadius: 3,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </Card>
  );
}

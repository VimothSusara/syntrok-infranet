import { H2, Breadcrumbs, Classes } from "@blueprintjs/core";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

interface Crumb {
  text: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        backgroundColor: "var(--bp-surface-background-color-default-rest)",
        borderBottom: "1px solid var(--bp-surface-border-color-default)",
        paddingTop: 28,
        paddingBottom: 16,
        marginBottom: 8,
      }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          items={breadcrumbs.map((crumb) => ({
            text: crumb.text,
            current: !crumb.to,
            onClick: crumb.to ? () => navigate(crumb.to!) : undefined,
          }))}
        />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: breadcrumbs?.length ? 8 : 0,
        }}
      >
        <div>
          <H2 style={{ margin: 0 }}>{title}</H2>
          {subtitle && (
            <div
              className={Classes.TEXT_MUTED}
              style={{ fontSize: 13, marginTop: 2 }}
            >
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>
    </div>
  );
}

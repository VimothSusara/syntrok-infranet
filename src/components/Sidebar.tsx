import { Link, useLocation } from "react-router-dom";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: IconName;
  match: (path: string) => boolean;
}[] = [
  { to: "/", label: "Dashboard", icon: "home", match: (p) => p === "/" },
  {
    to: "/projects",
    label: "Projects",
    icon: "folder-close",
    match: (p) => p.startsWith("/projects") || p.startsWith("/connections"),
  },
  {
    to: "/audit",
    label: "Audit Log",
    icon: "history",
    match: (p) => p.startsWith("/audit"),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: "cog",
    match: (p) => p.startsWith("/settings"),
  },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,0.1)",
        padding: "16px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div style={{ padding: "0 8px 16px", fontSize: 14, fontWeight: 600 }}>
        Syntrok Ops
      </div>
      {NAV_ITEMS.map((item) => {
        const active = item.match(location.pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 10px",
              borderRadius: 4,
              fontSize: 13,
              textDecoration: "none",
              background: active ? "rgba(45,114,210,0.2)" : "transparent",
              color: active ? "#8abbff" : "inherit",
            }}
          >
            <Icon icon={item.icon} size={16} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

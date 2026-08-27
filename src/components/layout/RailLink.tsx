import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import classNames from "clsx";

// A single nav-rail link item — used by Sidebar, EnvironmentLayout, and the
// WHM/cPanel connection layouts' feature rails. Each of those owns its own
// data shape (flat list, count badges, collapsible children with
// auto-expand) — this only extracts the actually-identical piece: the
// link's own active-state styling.
export function RailLink({
  to,
  icon,
  label,
  active,
  variant = "default",
  trailing,
  fill = false,
}: {
  to: string;
  icon?: IconName;
  label: string;
  active: boolean;
  variant?: "default" | "child";
  trailing?: ReactNode;
  // Only needed when this link shares a row with a sibling element (the
  // WHM/cPanel rails' expand/collapse chevron button) and must grow to
  // fill the remaining row width. Never set this for a plain vertical
  // list (Sidebar, EnvironmentLayout) — there the link is a direct child
  // of a column flex container, and flex:1 there would make it claim a
  // share of the *column's* full height instead, ballooning the item.
  fill?: boolean;
}) {
  return (
    <Link
      to={to}
      className={classNames("rail-link", {
        "rail-link--active": active,
        "rail-link--child": variant === "child",
      })}
      style={fill ? { flex: 1 } : undefined}
    >
      <span className="rail-link__main">
        {icon && <Icon icon={icon} size={16} />}
        {label}
      </span>
      {trailing}
    </Link>
  );
}

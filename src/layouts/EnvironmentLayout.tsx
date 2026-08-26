import { Outlet, useParams, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { getProjectById } from "../domain/projects";
import { getEnvironmentById, listEnvironments } from "../domain/environments";
import { listConnections } from "../domain/connections";
import { queryKeys } from "../domain/queryKeys";
import { PageHeader } from "../components/PageHeader";
import { SiblingNav } from "../components/SiblingNav";

interface ConnectorTab {
  path: string;
  label: string;
  icon: IconName;
}

// Adding a connector type is one line here plus its own route + page — the
// rail, active-tab highlighting, and layout mechanics don't need to change.
const CONNECTOR_TABS: ConnectorTab[] = [
  { path: "ssh", label: "SSH", icon: "console" },
  { path: "whm", label: "WHM", icon: "cloud" },
  { path: "cpanel", label: "cPanel", icon: "panel-table" },
  { path: "docker", label: "Docker", icon: "box" },
  { path: "github", label: "GitHub", icon: "git-branch" },
];

export function EnvironmentLayout() {
  const { projectId = "", environmentId = "" } = useParams<{
    projectId: string;
    environmentId: string;
  }>();
  const location = useLocation();
  const activeTab = location.pathname.split("/").filter(Boolean).pop();

  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => getProjectById(projectId),
    enabled: !!projectId,
  });
  const environmentQuery = useQuery({
    queryKey: queryKeys.environment(environmentId),
    queryFn: () => getEnvironmentById(environmentId),
    enabled: !!environmentId,
  });
  const siblingEnvironmentsQuery = useQuery({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => listEnvironments(projectId),
    enabled: !!projectId,
  });

  // Shared with EnvironmentSsh.tsx via the same query key — TanStack Query
  // dedupes this to one fetch, so the rail's count badge and the SSH page's
  // own list come from a single cache entry, not two separate requests.
  const connectionsQuery = useQuery({
    queryKey: queryKeys.connections(environmentId),
    queryFn: () => listConnections(environmentId),
    enabled: !!environmentId,
  });
  const sshCount = (connectionsQuery.data ?? []).filter(
    (c) => c.kind === "ssh",
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          {
            text: projectQuery.data?.name ?? "…",
            to: `/projects/${projectId}`,
          },
          { text: environmentQuery.data?.name ?? "…" },
        ]}
        title={environmentQuery.data?.name ?? "Environment"}
        actions={
          <SiblingNav
            items={siblingEnvironmentsQuery.data ?? []}
            currentId={environmentId}
            getPath={(e) => `/projects/${projectId}/environments/${e.id}`}
            getLabel={(e) => e.name}
          />
        }
      />

      <div
        style={{ display: "flex", gap: 16, flex: 1, minHeight: 0, marginTop: 20 }}
      >
        <nav
          style={{
            width: 160,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {CONNECTOR_TABS.map((tab) => {
            const active = activeTab === tab.path;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 4,
                  fontSize: 13,
                  textDecoration: "none",
                  background: active ? "rgba(45,114,210,0.2)" : "transparent",
                  color: active ? "var(--app-text-accent)" : "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon icon={tab.icon} size={16} />
                  {tab.label}
                </span>
                {tab.path === "ssh" && (
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{sshCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className="scroll-area"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}

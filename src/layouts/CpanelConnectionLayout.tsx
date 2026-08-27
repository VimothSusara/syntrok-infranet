import { useState } from "react";
import { Outlet, useParams, useLocation, useNavigate } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Tag, Intent, Alert, Spinner, NonIdealState } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { RailLink } from "../components/layout/RailLink";
import {
  getConnectionById,
  deleteConnection,
  listConnections,
  updateCpanelConnection,
  getResourceForConnection,
  type ConnectionDetails,
} from "../domain/connections";
import { listCredentials } from "../domain/credentials";
import { testCpanelConnection } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { PageHeader } from "../components/PageHeader";
import { SiblingNav } from "../components/SiblingNav";
import { EditConnectionDialog } from "../components/EditConnectionDialog";
import type { LayoutContext } from "./AppLayout";

export interface CpanelConnectionContext {
  connection: ConnectionDetails;
  resourceId: string | null;
  workspaceId: string;
}

interface RailItem {
  path: string;
  label: string;
  icon: IconName;
  children?: { path: string; label: string }[];
}

const RAIL_ITEMS: RailItem[] = [
  { path: "overview", label: "Overview", icon: "home" },
  { path: "account", label: "Account", icon: "person" },
  {
    path: "email",
    label: "Email",
    icon: "envelope",
    children: [
      { path: "email", label: "All Mailboxes" },
      { path: "email/create", label: "Create Mailbox" },
    ],
  },
  {
    path: "domain",
    label: "Domain",
    icon: "globe",
    children: [
      { path: "domain", label: "All Domains" },
      { path: "domain/add", label: "Add Domain" },
    ],
  },
  { path: "dns", label: "DNS", icon: "map" },
  {
    path: "database",
    label: "Database",
    icon: "database",
    children: [
      { path: "database/mysql", label: "MySQL" },
      { path: "database/postgresql", label: "PostgreSQL" },
    ],
  },
  { path: "server-info", label: "Server Info", icon: "info-sign" },
  { path: "ssl", label: "SSL Certificates", icon: "lock" },
  { path: "statistics", label: "Statistics", icon: "chart" },
];

export function CpanelConnectionLayout() {
  const { connectionId = "" } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { workspaceId } = useOutletContext<LayoutContext>();

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const connectionQuery = useQuery({
    queryKey: queryKeys.connection(connectionId),
    queryFn: () => getConnectionById(connectionId),
    enabled: !!connectionId,
  });
  const connection = connectionQuery.data;

  const resourceQuery = useQuery({
    queryKey: queryKeys.resource(connectionId),
    queryFn: () => getResourceForConnection(connectionId),
    enabled: !!connectionId,
  });

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(),
    queryFn: listCredentials,
  });

  const siblingConnectionsQuery = useQuery({
    queryKey: queryKeys.connections(connection?.environmentId ?? ""),
    queryFn: () => listConnections(connection!.environmentId),
    enabled: !!connection,
  });
  const cpanelSiblings = (siblingConnectionsQuery.data ?? []).filter((c) => c.kind === "cpanel");

  const testMutation = useMutation({
    mutationFn: () => {
      if (!connection || !resourceQuery.data) throw new Error("Not ready yet");
      return testCpanelConnection(connection, resourceQuery.data.id);
    },
    onSuccess: () => {
      showSuccess(`Verified ${connection?.host}`);
      if (connection) {
        invalidateConnectionState(queryClient, {
          connectionId,
          environmentId: connection.environmentId,
          workspaceId,
        });
      }
    },
    onError: (err) => showError(`Test failed: ${describeError(err)}`),
  });

  const updateMutation = useMutation({
    mutationFn: (value: {
      host: string;
      port: number;
      credential: Parameters<typeof updateCpanelConnection>[1]["credential"];
    }) => updateCpanelConnection(connectionId, value),
    onSuccess: () => {
      showSuccess("Connection updated");
      if (connection) {
        invalidateConnectionState(queryClient, {
          connectionId,
          environmentId: connection.environmentId,
          workspaceId,
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
      setEditOpen(false);
    },
    onError: (err) => showError(`Failed to update connection: ${describeError(err)}`),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onError: (err) => showError(`Failed to remove: ${describeError(err)}`),
  });

  if (connectionQuery.isLoading) return <Spinner size={32} />;
  if (!connection) return <NonIdealState icon="offline" title="Connection not found" />;
  if (connection.kind !== "cpanel")
    return (
      <NonIdealState
        icon="error"
        title="Not a cPanel connection"
        description="This connection isn't a cPanel account."
      />
    );

  function handleConfirmRemove() {
    if (!connection) return;
    const { host, projectId, environmentId, id } = connection;
    removeMutation.mutate(id, {
      onSuccess: () => {
        showSuccess(`Removed ${host}`);
        queryClient.invalidateQueries({ queryKey: queryKeys.connections(environmentId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
        navigate(`/projects/${projectId}/environments/${environmentId}/cpanel`);
      },
    });
    setConfirmRemoveOpen(false);
  }

  const basePath = `/cpanel-connections/${connectionId}/`;
  const activePath = location.pathname.startsWith(basePath) ? location.pathname.slice(basePath.length) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          { text: connection.projectName, to: `/projects/${connection.projectId}` },
          {
            text: connection.environmentName,
            to: `/projects/${connection.projectId}/environments/${connection.environmentId}/cpanel`,
          },
          { text: connection.host },
        ]}
        title={connection.host}
        subtitle={`${connection.host}:${connection.port} · cPanel · ${connection.credentialUsername}`}
        actions={
          <>
            <SiblingNav
              items={cpanelSiblings}
              currentId={connection.id}
              getPath={(c) => `/cpanel-connections/${c.id}`}
              getLabel={(c) => `${c.host}:${c.port}`}
            />
            <Button size="small" variant="minimal" icon="edit" text="Edit" onClick={() => setEditOpen(true)} />
            <Button
              size="small"
              variant="minimal"
              intent={Intent.DANGER}
              text="Remove connection"
              onClick={() => setConfirmRemoveOpen(true)}
            />
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "16px 0" }}>
        <Tag intent={connection.last_verified_at ? Intent.SUCCESS : Intent.WARNING} minimal>
          {connection.last_verified_at
            ? `verified ${new Date(connection.last_verified_at).toLocaleString()}`
            : "unverified"}
        </Tag>
        <Button size="small" text="Test connection" loading={testMutation.isPending} onClick={() => testMutation.mutate()} />
      </div>

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        <nav style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {RAIL_ITEMS.map((item) => {
            const isParentActive = activePath === item.path || activePath.startsWith(`${item.path}/`);
            const linkTarget = item.children ? item.children[0].path : item.path;
            const isExpanded = item.children ? (expanded[item.path] ?? isParentActive) : false;

            return (
              <div key={item.path}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <RailLink to={linkTarget} icon={item.icon} label={item.label} active={isParentActive} fill />
                  {item.children && (
                    <Button
                      variant="minimal"
                      size="small"
                      icon={isExpanded ? "chevron-down" : "chevron-right"}
                      onClick={() => setExpanded((prev) => ({ ...prev, [item.path]: !isExpanded }))}
                    />
                  )}
                </div>
                {item.children && isExpanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 20 }}>
                    {item.children.map((child) => (
                      <RailLink
                        key={child.path}
                        to={child.path}
                        label={child.label}
                        active={activePath === child.path}
                        variant="child"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: "auto", width: "100%" }}>
          <Outlet
            context={{ connection, resourceId: resourceQuery.data?.id ?? null, workspaceId } satisfies CpanelConnectionContext}
          />
        </div>
      </div>

      <Alert
        isOpen={confirmRemoveOpen}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Remove"
        cancelButtonText="Cancel"
        loading={removeMutation.isPending}
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemoveOpen(false)}
        canOutsideClickCancel
      >
        <p>
          Remove <strong>{connection.host}</strong>? This deletes the connection and its stored credential — audit
          history is kept.
        </p>
      </Alert>

      <EditConnectionDialog
        isOpen={editOpen}
        kind="cpanel"
        host={connection.host}
        port={connection.port}
        credentialId={connection.credential_id}
        credentials={credentialsQuery.data ?? []}
        loading={updateMutation.isPending}
        onConfirm={(value) =>
          updateMutation.mutate(
            value as {
              host: string;
              port: number;
              credential: Parameters<typeof updateCpanelConnection>[1]["credential"];
            },
          )
        }
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

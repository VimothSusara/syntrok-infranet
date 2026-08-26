import { useState } from "react";
import {
  Outlet,
  useParams,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Icon,
  Button,
  Tag,
  Intent,
  Alert,
  Spinner,
  NonIdealState,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import {
  getConnectionById,
  deleteConnection,
  listConnections,
  updateWhmConnection,
  getResourceForConnection,
  type ConnectionDetails,
} from "../domain/connections";
import { listCredentials } from "../domain/credentials";
import { testWhmConnection } from "../domain/whm";
import { queryKeys } from "../domain/queryKeys";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { PageHeader } from "../components/PageHeader";
import { SiblingNav } from "../components/SiblingNav";
import { EditConnectionDialog } from "../components/EditConnectionDialog";
import type { LayoutContext } from "./AppLayout";

export interface WhmConnectionContext {
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
  {
    path: "accounts",
    label: "Accounts",
    icon: "people",
    children: [
      { path: "accounts", label: "All Accounts" },
      { path: "accounts/create", label: "Create Account" },
    ],
  },
  { path: "packages", label: "Packages", icon: "grid-view" },
  { path: "dns", label: "DNS", icon: "map" },
  { path: "email", label: "Email", icon: "envelope" },
  { path: "ssl", label: "SSL/TLS", icon: "lock" },
  { path: "server-status", label: "Server Status", icon: "pulse" },
];

export function WhmConnectionLayout() {
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
  const whmSiblings = (siblingConnectionsQuery.data ?? []).filter(
    (c) => c.kind === "whm",
  );

  const testMutation = useMutation({
    mutationFn: () => {
      if (!connection || !resourceQuery.data) throw new Error("Not ready yet");
      return testWhmConnection(connection, resourceQuery.data.id);
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
      credential: Parameters<typeof updateWhmConnection>[1]["credential"];
    }) => updateWhmConnection(connectionId, value),
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
    onError: (err) =>
      showError(`Failed to update connection: ${describeError(err)}`),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onError: (err) => showError(`Failed to remove: ${describeError(err)}`),
  });

  if (connectionQuery.isLoading) return <Spinner size={32} />;
  if (!connection)
    return <NonIdealState icon="offline" title="Connection not found" />;
  if (connection.kind !== "whm")
    return (
      <NonIdealState
        icon="error"
        title="Not a WHM connection"
        description="This connection isn't a WHM server."
      />
    );

  function handleConfirmRemove() {
    if (!connection) return;
    const { host, projectId, environmentId, id } = connection;
    removeMutation.mutate(id, {
      onSuccess: () => {
        showSuccess(`Removed ${host}`);
        queryClient.invalidateQueries({
          queryKey: queryKeys.connections(environmentId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
        navigate(`/projects/${projectId}/environments/${environmentId}/whm`);
      },
    });
    setConfirmRemoveOpen(false);
  }

  const basePath = `/whm-connections/${connectionId}/`;
  const activePath = location.pathname.startsWith(basePath)
    ? location.pathname.slice(basePath.length)
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          {
            text: connection.projectName,
            to: `/projects/${connection.projectId}`,
          },
          {
            text: connection.environmentName,
            to: `/projects/${connection.projectId}/environments/${connection.environmentId}/whm`,
          },
          { text: connection.host },
        ]}
        title={connection.host}
        subtitle={`${connection.host}:${connection.port} · WHM · ${connection.credentialUsername}`}
        actions={
          <>
            <SiblingNav
              items={whmSiblings}
              currentId={connection.id}
              getPath={(c) => `/whm-connections/${c.id}`}
              getLabel={(c) => `${c.host}:${c.port}`}
            />
            <Button
              small
              minimal
              icon="edit"
              text="Edit"
              onClick={() => setEditOpen(true)}
            />
            <Button
              small
              minimal
              intent={Intent.DANGER}
              text="Remove connection"
              onClick={() => setConfirmRemoveOpen(true)}
            />
          </>
        }
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          margin: "16px 0",
        }}
      >
        <Tag
          intent={connection.last_verified_at ? Intent.SUCCESS : Intent.WARNING}
          minimal
        >
          {connection.last_verified_at
            ? `verified ${new Date(connection.last_verified_at).toLocaleString()}`
            : "unverified"}
        </Tag>
        <Button
          small
          text="Test connection"
          loading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        />
      </div>

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        <nav
          style={{
            width: 180,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {RAIL_ITEMS.map((item) => {
            const isParentActive =
              activePath === item.path ||
              activePath.startsWith(`${item.path}/`);
            const linkTarget = item.children
              ? item.children[0].path
              : item.path;
            const isExpanded = item.children
              ? (expanded[item.path] ?? isParentActive)
              : false;

            return (
              <div key={item.path}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Link
                    to={linkTarget}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 10px",
                      borderRadius: 4,
                      fontSize: 13,
                      textDecoration: "none",
                      background: isParentActive
                        ? "rgba(45,114,210,0.2)"
                        : "transparent",
                      color: isParentActive
                        ? "var(--app-text-accent)"
                        : "inherit",
                    }}
                  >
                    <Icon icon={item.icon} size={16} />
                    {item.label}
                  </Link>
                  {item.children && (
                    <Button
                      minimal
                      small
                      icon={isExpanded ? "chevron-down" : "chevron-right"}
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [item.path]: !isExpanded,
                        }))
                      }
                    />
                  )}
                </div>
                {item.children && isExpanded && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      marginLeft: 20,
                    }}
                  >
                    {item.children.map((child) => {
                      const active = activePath === child.path;
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 4,
                            fontSize: 12,
                            textDecoration: "none",
                            background: active
                              ? "rgba(45,114,210,0.2)"
                              : "transparent",
                            color: active
                              ? "var(--app-text-accent)"
                              : "inherit",
                          }}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div
          className="scroll-area"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Outlet
            context={
              {
                connection,
                resourceId: resourceQuery.data?.id ?? null,
                workspaceId,
              } satisfies WhmConnectionContext
            }
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
          Remove <strong>{connection.host}</strong>? This deletes the connection
          and its stored credential — audit history is kept.
        </p>
      </Alert>

      <EditConnectionDialog
        isOpen={editOpen}
        kind="whm"
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
              credential: Parameters<
                typeof updateWhmConnection
              >[1]["credential"];
            },
          )
        }
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

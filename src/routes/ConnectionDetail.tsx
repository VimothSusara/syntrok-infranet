import { useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  H5,
  Tag,
  Intent,
  Spinner,
  NonIdealState,
  Button,
  Alert,
  Pre,
  HTMLTable,
  Tooltip,
  Classes,
  Collapse,
} from "@blueprintjs/core";
import {
  getConnectionById,
  getResourceForConnection,
  deleteConnection,
  clearHostFingerprint,
  updateConnection,
} from "../domain/connections";
import {
  testConnection,
  listServices,
  restartService,
  describeRestartFailure,
  withCredentials,
} from "../domain/operations";
import { listAuditEvents } from "../domain/audit";
import { parseCapabilities } from "../domain/capabilities";
import { CapabilityGate } from "../components/CapabilityGate";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { queryKeys } from "../domain/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { formatBytes, formatUptime, usageIntent } from "../lib/format";
import { getSystemMetrics } from "../domain/systemMetrics";
import { PageHeader } from "../components/PageHeader";
import { listConnections } from "../domain/connections";
import { SiblingNav } from "../components/SiblingNav";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import type { LayoutContext } from "../layouts/AppLayout";
import { listCredentials } from "../domain/credentials";
import { EditConnectionDialog } from "../components/EditConnectionDialog";

export function ConnectionDetailPage() {
  const { connectionId = "" } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId } = useOutletContext<LayoutContext>();

  const [serviceToRestart, setServiceToRestart] = useState<string | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const [rawOpen, setRawOpen] = useState(false);
  const [forgetKeyOpen, setForgetKeyOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);

  const credentialsQuery = useQuery({
    queryKey: queryKeys.credentials(),
    queryFn: listCredentials,
  });

  const connectionQuery = useQuery({
    queryKey: queryKeys.connection(connectionId),
    queryFn: () => getConnectionById(connectionId),
    enabled: !!connectionId,
  });

  const resourceQuery = useQuery({
    queryKey: queryKeys.resource(connectionId),
    queryFn: () => getResourceForConnection(connectionId),
    enabled: !!connectionId,
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.auditEvents(connectionId),
    queryFn: () => listAuditEvents(connectionId),
    enabled: !!connectionId,
  });

  const connection = connectionQuery.data;
  const capabilities = parseCapabilities(resourceQuery.data?.metadata ?? null);

  const siblingConnectionsQuery = useQuery({
    queryKey: queryKeys.connections(connection?.environmentId ?? ""),
    queryFn: () => listConnections(connection!.environmentId),
    enabled: !!connection,
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!connection || !resourceQuery.data) throw new Error("Not ready yet");
      return testConnection(connection, resourceQuery.data.id);
    },
    onSuccess: (discovery) => {
      showSuccess(
        `Verified ${connection?.host} — systemd:${discovery.systemd} docker:${discovery.docker} podman:${discovery.podman}`,
      );
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

  const systemMetricsQuery = useQuery({
    queryKey: queryKeys.systemMetrics(connectionId),
    queryFn: async () => {
      const creds = await withCredentials(connection!);
      return getSystemMetrics(connection!.id, creds);
    },
    enabled: !!connection,
  });

  const forgetKeyMutation = useMutation({
    mutationFn: () => clearHostFingerprint(connectionId),
    onSuccess: () => {
      showSuccess(
        "Saved host key cleared — it will be re-pinned on the next connection.",
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.connection(connectionId),
      });
    },
    onError: (err) =>
      showError(`Failed to clear host key: ${describeError(err)}`),
    onSettled: () => setForgetKeyOpen(false),
  });

  const servicesQuery = useQuery({
    queryKey: queryKeys.services(connectionId),
    queryFn: () => listServices(connection!),
    enabled: !!connection && capabilities?.systemd === true,
  });

  const restartMutation = useMutation({
    mutationFn: async (serviceName: string) => {
      if (!connection || !resourceQuery.data) throw new Error("Not ready yet");
      return restartService(connection, resourceQuery.data.id, serviceName);
    },
    onSuccess: (result, serviceName) => {
      if (result.exit_status === 0) showSuccess(`Restarted ${serviceName}`);
      else showError(describeRestartFailure(result));
      queryClient.invalidateQueries({
        queryKey: queryKeys.auditEvents(connectionId),
      });
    },
    onError: (err) => showError(`Restart failed: ${describeError(err)}`),
    onSettled: () => setServiceToRestart(null),
  });

  const updateMutation = useMutation({
    mutationFn: (value: {
      host: string;
      port: number;
      credential: Parameters<typeof updateConnection>[1]["credential"];
    }) => updateConnection(connectionId, value),
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

  function handleConfirmRemove() {
    if (!connection) return;
    const { host, projectId, environmentId, id } = connection;
    removeMutation.mutate(id, {
      onSuccess: () => {
        showSuccess(`Removed ${host}`);
        queryClient.invalidateQueries({
          queryKey: queryKeys.connections(environmentId),
        });
        // Removing a connection can also delete its credential (if unused
        // elsewhere) — without this, the cached credentials list (staleTime
        // 30s) can still offer that now-deleted credential on the environment
        // page the user lands on next.
        queryClient.invalidateQueries({ queryKey: queryKeys.credentials() });
        navigate(`/projects/${projectId}/environments/${environmentId}`);
      },
    });
    setConfirmRemoveOpen(false);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { text: "Projects", to: "/projects" },
          {
            text: connection.projectName,
            to: `/projects/${connection.projectId}`,
          },
          {
            text: connection.environmentName,
            to: `/projects/${connection.projectId}/environments/${connection.environmentId}`,
          },
          { text: connection.host },
        ]}
        title={connection.host}
        subtitle={`${connection.host}:${connection.port} · ${connection.credentialKind} · ${connection.credentialUsername}`}
        actions={
          <>
            <SiblingNav
              items={siblingConnectionsQuery.data ?? []}
              currentId={connection.id}
              getPath={(c) => `/connections/${c.id}`}
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
          marginBottom: 16,
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

        {connection.known_host_fingerprint ? (
          <Tooltip content={connection.known_host_fingerprint}>
            <Tag minimal icon="key">
              host key pinned
            </Tag>
          </Tooltip>
        ) : (
          <Tag minimal icon="key" intent={Intent.WARNING}>
            host key not pinned yet
          </Tag>
        )}

        {connection.known_host_fingerprint && (
          <Button
            small
            minimal
            text="Forget saved host key"
            onClick={() => setForgetKeyOpen(true)}
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        {capabilities ? (
          <>
            <Tag
              intent={capabilities.systemd ? Intent.SUCCESS : Intent.NONE}
              minimal
            >
              systemd
            </Tag>
            <Tag
              intent={capabilities.docker ? Intent.SUCCESS : Intent.NONE}
              minimal
            >
              docker
            </Tag>
            <Tag
              intent={capabilities.podman ? Intent.SUCCESS : Intent.NONE}
              minimal
            >
              podman
            </Tag>
          </>
        ) : (
          <span className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
            Capabilities not yet discovered
          </span>
        )}
        <Button
          small
          text="Test connection"
          loading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <H5 style={{ margin: 0 }}>System info</H5>
          <Button
            small
            text="Refresh"
            loading={systemMetricsQuery.isFetching}
            onClick={() => systemMetricsQuery.refetch()}
          />
        </div>

        {systemMetricsQuery.isError ? (
          <NonIdealState
            icon="error"
            title="Could not read system info"
            description={describeError(systemMetricsQuery.error)}
          />
        ) : !systemMetricsQuery.data ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : (
          <>
            {(() => {
              const m = systemMetricsQuery.data;
              const memUsed = m.memory.totalBytes - m.memory.availableBytes;
              const memPercent =
                m.memory.totalBytes > 0
                  ? (memUsed / m.memory.totalBytes) * 100
                  : 0;
              const diskPercent =
                m.disk.totalBytes > 0
                  ? (m.disk.usedBytes / m.disk.totalBytes) * 100
                  : 0;

              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <MetricCard
                    label="Load average"
                    value={m.loadAverage.load1.toFixed(2)}
                    subtext={`5m ${m.loadAverage.load5.toFixed(2)} · 15m ${m.loadAverage.load15.toFixed(2)}`}
                  />
                  <MetricCard
                    label="Memory"
                    value={formatBytes(memUsed)}
                    subtext={`of ${formatBytes(m.memory.totalBytes)}`}
                    percent={memPercent}
                    intent={usageIntent(memPercent)}
                  />
                  <MetricCard
                    label="Disk"
                    value={formatBytes(m.disk.usedBytes)}
                    subtext={`of ${formatBytes(m.disk.totalBytes)}`}
                    percent={diskPercent}
                    intent={usageIntent(diskPercent)}
                  />
                  <MetricCard
                    label="Uptime"
                    value={formatUptime(m.uptimeSeconds)}
                  />
                </div>
              );
            })()}

            <Button
              minimal
              small
              text={rawOpen ? "Hide raw output" : "Show raw output"}
              onClick={() => setRawOpen((v) => !v)}
            />
            <Collapse isOpen={rawOpen}>
              <Pre style={{ marginTop: 10 }}>{systemMetricsQuery.data.raw}</Pre>
            </Collapse>
          </>
        )}
      </Card>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}
      >
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <H5 style={{ margin: 0 }}>Running services</H5>
            {capabilities?.systemd && (
              <Button
                small
                text="Refresh"
                loading={servicesQuery.isFetching}
                onClick={() => servicesQuery.refetch()}
              />
            )}
          </div>

          <CapabilityGate
            capabilities={capabilities}
            requires="systemd"
            label="systemd"
          >
            {servicesQuery.isError ? (
              <NonIdealState
                icon="error"
                title="Could not load services"
                description={describeError(servicesQuery.error)}
              />
            ) : servicesQuery.data === undefined ? (
              <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
            ) : servicesQuery.data.length === 0 ? (
              <NonIdealState icon="search" title="No running services found" />
            ) : (
              <>
                {capabilities && !capabilities.passwordlessSudo && (
                  <div
                    className={Classes.TEXT_MUTED}
                    style={{ fontSize: 12, marginBottom: 10 }}
                  >
                    Restart is unavailable — this user doesn&apos;t have
                    passwordless sudo configured on this server.
                  </div>
                )}
                <HTMLTable compact interactive style={{ width: "100%" }}>
                  <tbody>
                    {servicesQuery.data.map((service) => (
                      <tr key={service}>
                        <td>{service}</td>
                        <td style={{ textAlign: "right" }}>
                          {capabilities?.passwordlessSudo ? (
                            <Button
                              small
                              intent={Intent.DANGER}
                              text="Restart"
                              onClick={() => setServiceToRestart(service)}
                            />
                          ) : (
                            <Tooltip content="Passwordless sudo isn't configured for this user on this server">
                              <Button small disabled text="Restart" />
                            </Tooltip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </HTMLTable>
              </>
            )}
          </CapabilityGate>
        </Card>

        <Card>
          <H5>Recent activity</H5>
          {auditQuery.isLoading && <Spinner size={20} />}
          {auditQuery.data?.length === 0 && (
            <NonIdealState icon="history" title="No activity yet" />
          )}
          {auditQuery.data?.map((event) => (
            <div
              key={event.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 0",
                borderBottom:
                  "1px solid var(--bp-surface-border-color-default)",
              }}
            >
              <div style={{ fontSize: 12 }}>
                {event.action}
                {event.detail ? ` — ${event.detail}` : ""}
              </div>
              <Tag
                intent={
                  event.result === "success" ? Intent.SUCCESS : Intent.DANGER
                }
                minimal
              >
                {event.result}
              </Tag>
            </div>
          ))}
        </Card>
      </div>

      <Alert
        isOpen={serviceToRestart !== null}
        icon="warning-sign"
        intent={Intent.DANGER}
        confirmButtonText="Restart"
        cancelButtonText="Cancel"
        loading={restartMutation.isPending}
        onConfirm={() =>
          serviceToRestart && restartMutation.mutate(serviceToRestart)
        }
        onCancel={() => setServiceToRestart(null)}
        canOutsideClickCancel
      >
        <p>
          Restart <strong>{serviceToRestart}</strong> on {connection.host}? This
          will briefly interrupt the service.
        </p>
      </Alert>

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

      <Alert
        isOpen={forgetKeyOpen}
        icon="key"
        intent={Intent.WARNING}
        confirmButtonText="Forget host key"
        cancelButtonText="Cancel"
        loading={forgetKeyMutation.isPending}
        onConfirm={() => forgetKeyMutation.mutate()}
        onCancel={() => setForgetKeyOpen(false)}
        canOutsideClickCancel
      >
        <p>
          Only do this if you know <strong>{connection.host}</strong>{" "}
          legitimately rotated its host key (reinstall, key regeneration) and
          you've verified the new key out-of-band. The next connection will
          trust and pin whatever key the server presents.
        </p>
      </Alert>

      <EditConnectionDialog
        isOpen={editOpen}
        host={connection.host}
        port={connection.port}
        credentialId={connection.credential_id}
        credentials={credentialsQuery.data ?? []}
        loading={updateMutation.isPending}
        onConfirm={(value) => updateMutation.mutate(value)}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Card,
  H2,
  H5,
  Spinner,
  NonIdealState,
  Button,
  Tag,
  Intent,
  Classes,
} from "@blueprintjs/core";
import {
  getDashboardStats,
  listUnverifiedConnections,
  listRecentAuditEvents,
} from "../domain/dashboard";
import { getResourceForConnection } from "../domain/connections";
import { testConnection } from "../domain/operations";
import { queryKeys } from "../domain/queryKeys";
import type { LayoutContext } from "../layouts/AppLayout";
import type { Connection } from "../domain/types";
import { showError, showSuccess } from "../lib/toaster";
import { PageHeader } from "../components/PageHeader";

export function DashboardPage() {
  const { workspaceId } = useOutletContext<LayoutContext>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const statsQuery = useQuery({
    queryKey: queryKeys.dashboardStats(workspaceId),
    queryFn: () => getDashboardStats(workspaceId),
  });

  const unverifiedQuery = useQuery({
    queryKey: queryKeys.unverifiedConnections(workspaceId),
    queryFn: () => listUnverifiedConnections(workspaceId),
  });

  const activityQuery = useQuery({
    queryKey: queryKeys.recentAuditEvents(workspaceId),
    queryFn: () => listRecentAuditEvents(),
  });

  const testMutation = useMutation({
    mutationFn: async (connection: Connection) => {
      const resource = await getResourceForConnection(connection.id);
      if (!resource) throw new Error("No resource record for this connection");
      return testConnection(connection, resource.id);
    },
    onSuccess: (_discovery, connection) => {
      showSuccess(`Verified ${connection.host}`);
      queryClient.invalidateQueries({
        queryKey: queryKeys.unverifiedConnections(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardStats(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.recentAuditEvents(workspaceId),
      });
    },
    onError: (err) => {
      console.error("Test failed:", err);
      showError(`Test failed: ${String(err)}`);
    },
  });

  if (!statsQuery.isLoading && statsQuery.data?.projectCount === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <NonIdealState
          icon="cube-add"
          title="Welcome to Syntrok InfraNet"
          description="Create your first project to start connecting and managing servers."
          action={
            <Button
              intent={Intent.PRIMARY}
              text="Create a project"
              onClick={() => navigate("/projects")}
            />
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          margin: "20px 0",
        }}
      >
        <StatCard
          label="Projects"
          value={statsQuery.data?.projectCount}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Servers"
          value={statsQuery.data?.serverCount}
          loading={statsQuery.isLoading}
        />
        <StatCard
          label="Unverified connections"
          value={statsQuery.data?.unverifiedCount}
          loading={statsQuery.isLoading}
          warn={!!statsQuery.data?.unverifiedCount}
        />
        <StatCard
          label="Audit events"
          value={activityQuery.data?.length}
          loading={activityQuery.isLoading}
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}
      >
        <Card>
          <H5>Recent activity</H5>
          {activityQuery.isLoading && <Spinner size={20} />}
          {activityQuery.data?.length === 0 && (
            <NonIdealState
              icon="history"
              title="No activity yet"
              description="Actions you take on servers will show up here."
            />
          )}
          {activityQuery.data?.map((event) => (
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
              <div>
                <div style={{ fontSize: 13 }}>
                  {event.action}{" "}
                  {event.connectionHost && (
                    <span style={{ opacity: 0.7 }}>
                      &mdash; {event.connectionHost}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {event.projectName ?? "removed connection"} &middot;{" "}
                  {new Date(event.created_at).toLocaleString()}
                </div>
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

        <Card>
          <H5>Attention needed</H5>
          {unverifiedQuery.isLoading && <Spinner size={20} />}
          {unverifiedQuery.data?.length === 0 && (
            <NonIdealState
              icon="tick-circle"
              title="All verified"
              description="Every connection has been tested successfully."
            />
          )}
          {unverifiedQuery.data?.map((connection) => (
            <div key={connection.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13 }}>
                {connection.host}:{connection.port}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
                {connection.projectName} / {connection.environmentName} &middot;
                never verified
              </div>
              <Button
                small
                fill
                text="Test connection"
                loading={testMutation.isPending}
                onClick={() => testMutation.mutate(connection)}
              />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  warn,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <Card>
      <div
        className={Classes.TEXT_MUTED}
        style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}
      >
        {label}
      </div>
      {loading ? (
        <Spinner size={20} />
      ) : (
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: warn ? "var(--app-text-warning)" : undefined,
          }}
        >
          {value ?? 0}
        </div>
      )}
    </Card>
  );
}

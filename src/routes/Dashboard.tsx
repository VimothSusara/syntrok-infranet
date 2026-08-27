import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext, Link } from "react-router-dom";
import {
  Card,
  H5,
  Spinner,
  NonIdealState,
  Button,
  Classes,
  Intent,
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
import { describeError } from "../lib/errors";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import { PageHeader } from "../components/PageHeader";
import { TileGrid } from "../components/layout/TileGrid";
import { SplitPane } from "../components/layout/SplitPane";
import { RecentActivityCard, type ActivityItem } from "../components/RecentActivityCard";
import { testWhmConnection } from "../domain/whm";
import { testCpanelConnection } from "../domain/cpanel";

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
      if (connection.kind === "whm") return testWhmConnection(connection, resource.id);
      if (connection.kind === "cpanel") return testCpanelConnection(connection, resource.id);
      return testConnection(connection, resource.id);
    },
    onSuccess: (_result, connection) => {
      showSuccess(`Verified ${connection.host}`);
      invalidateConnectionState(queryClient, {
        connectionId: connection.id,
        environmentId: connection.environment_id,
        workspaceId,
      });
    },
    onError: (err) => {
      console.error("Test failed:", err);
      showError(`Test failed: ${describeError(err)}`);
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

  const activityItems: ActivityItem[] = (activityQuery.data ?? []).map((event) => ({
    id: event.id,
    result: event.result,
    content: (
      <div>
        <div style={{ fontSize: 13 }}>
          {event.action}{" "}
          {event.connectionHost && <span className={Classes.TEXT_MUTED}>&mdash; {event.connectionHost}</span>}
        </div>
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 11 }}>
          {event.projectName ?? "removed connection"} &middot; {new Date(event.created_at).toLocaleString()}
        </div>
      </div>
    ),
  }));

  return (
    <div>
      <PageHeader title="Dashboard" />

      <TileGrid columns={4} gap={14} style={{ margin: "20px 0" }}>
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
      </TileGrid>

      <SplitPane
        ratio="1.5fr 1fr"
        gap={14}
        left={
          <RecentActivityCard
            title="Recent activity"
            items={activityItems}
            isLoading={activityQuery.isLoading}
            emptyDescription="Actions you take on servers will show up here."
          />
        }
        right={
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
                <Link
                  to={
                    connection.kind === "whm"
                      ? `/whm-connections/${connection.id}`
                      : connection.kind === "cpanel"
                        ? `/cpanel-connections/${connection.id}`
                        : `/connections/${connection.id}`
                  }
                  style={{ fontSize: 13, fontWeight: 600, color: "inherit" }}
                >
                  {connection.host}:{connection.port}
                </Link>

                <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, marginBottom: 6 }}>
                  {connection.projectName} / {connection.environmentName} &middot;
                  never verified
                </div>
                <Button
                  size="small"
                  fill
                  text="Test connection"
                  loading={testMutation.isPending}
                  onClick={() => testMutation.mutate(connection)}
                />
              </div>
            ))}
          </Card>
        }
      />
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

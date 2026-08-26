import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../domain/queryKeys";

// A connection's verified/capability state is rendered from several separately
// cached queries: its own detail page, its environment's connection list, its
// live system-info and services panels, and the dashboard's unverified-
// connections widget. Any action that changes what host/credentials a
// connection actually points at (testing it, or editing its settings) must
// invalidate all of them — otherwise whichever ones weren't the trigger keep
// showing stale state (or worse, a *different* server's data) until staleTime
// (30s) lapses.
export function invalidateConnectionState(
    queryClient: QueryClient,
    params: { connectionId: string; environmentId: string; workspaceId: string },
): void {
    queryClient.invalidateQueries({ queryKey: queryKeys.connection(params.connectionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.connections(params.environmentId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.resource(params.connectionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.systemMetrics(params.connectionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.services(params.connectionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.auditEvents(params.connectionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.unverifiedConnections(params.workspaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats(params.workspaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.recentAuditEvents(params.workspaceId) });
}

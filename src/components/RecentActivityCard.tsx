import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, H5, Spinner, NonIdealState, Tag, Intent } from "@blueprintjs/core";
import { listAuditEvents } from "../domain/audit";
import { queryKeys } from "../domain/queryKeys";

export interface ActivityItem {
    id: string;
    result: "success" | "failure";
    content: ReactNode;
}

// Connector-agnostic: renders whatever items it's given. Each caller
// decides its own row content (a per-connection audit feed vs. Dashboard's
// workspace-wide feed show different information), so this component has
// zero knowledge of connectors or audit events specifically.
export function RecentActivityCard({
    title = "Recent activity",
    items,
    isLoading,
    emptyDescription,
}: {
    title?: string;
    items: ActivityItem[];
    isLoading: boolean;
    emptyDescription?: string;
}) {
    return (
        <Card>
            <H5>{title}</H5>
            {isLoading && <Spinner size={20} />}
            {!isLoading && items.length === 0 && (
                <NonIdealState icon="history" title="No activity yet" description={emptyDescription} />
            )}
            {items.map((item) => (
                <div
                    key={item.id}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "9px 0",
                        borderBottom: "1px solid var(--bp-surface-border-color-default)",
                    }}
                >
                    {item.content}
                    <Tag intent={item.result === "success" ? Intent.SUCCESS : Intent.DANGER} minimal>
                        {item.result}
                    </Tag>
                </div>
            ))}
        </Card>
    );
}

// Shared convenience for the common case (a single connection's own audit
// feed) — used identically by every connector's detail page, so it lives
// here rather than being re-fetched/re-mapped three times.
export function useConnectionActivity(connectionId: string): { items: ActivityItem[]; isLoading: boolean } {
    const query = useQuery({
        queryKey: queryKeys.auditEvents(connectionId),
        queryFn: () => listAuditEvents(connectionId),
        enabled: !!connectionId,
    });

    const items: ActivityItem[] = (query.data ?? []).map((event) => ({
        id: event.id,
        result: event.result,
        content: (
            <div style={{ fontSize: 12 }}>
                {event.action}
                {event.detail ? ` — ${event.detail}` : ""}
            </div>
        ),
    }));

    return { items, isLoading: query.isLoading };
}

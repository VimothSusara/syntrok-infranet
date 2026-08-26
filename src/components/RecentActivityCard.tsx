import { useQuery } from "@tanstack/react-query";
import {
  Card,
  H5,
  Spinner,
  NonIdealState,
  Tag,
  Intent,
} from "@blueprintjs/core";
import { listAuditEvents } from "../domain/audit";
import { queryKeys } from "../domain/queryKeys";

export function RecentActivityCard({ connectionId }: { connectionId: string }) {
  const auditQuery = useQuery({
    queryKey: queryKeys.auditEvents(connectionId),
    queryFn: () => listAuditEvents(connectionId),
    enabled: !!connectionId,
  });

  return (
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
            borderBottom: "1px solid var(--bp-surface-border-color-default)",
          }}
        >
          <div style={{ fontSize: 12 }}>
            {event.action}
            {event.detail ? ` — ${event.detail}` : ""}
          </div>
          <Tag
            intent={event.result === "success" ? Intent.SUCCESS : Intent.DANGER}
            minimal
          >
            {event.result}
          </Tag>
        </div>
      ))}
    </Card>
  );
}

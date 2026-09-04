import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, Tag, Intent, Classes, NonIdealState } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { MetricCard } from "../components/MetricCard";
import { TileGrid } from "../components/layout/TileGrid";
import { getCpanelServerInfo } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelServerInfoPage() {
  const { connection } = useOutletContext<CpanelConnectionContext>();

  const infoQuery = useQuery({
    queryKey: queryKeys.cpanelServerInfo(connection.id),
    queryFn: () => getCpanelServerInfo(connection),
  });

  const metrics = (infoQuery.data ?? []).filter((item) => item.kind !== "service");
  const services = (infoQuery.data ?? []).filter((item) => item.kind === "service");

  return (
    <div>
      <StickySubHeader
        title="Server Info"
        actions={<Button size="small" text="Refresh" loading={infoQuery.isFetching} onClick={() => infoQuery.refetch()} />}
      />

      {infoQuery.isError ? (
        <NonIdealState icon="error" title="Could not load server information" description={describeError(infoQuery.error)} />
      ) : !infoQuery.data ? (
        <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
      ) : (
        <>
          {metrics.length > 0 && (
            <TileGrid columns={Math.min(4, metrics.length)} style={{ marginBottom: 16 }}>
              {metrics.map((metric) => (
                <MetricCard key={metric.name} label={metric.name} value={metric.value} />
              ))}
            </TileGrid>
          )}

          <Card>
            <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 10 }}>
              Services
            </div>
            {services.length === 0 ? (
              <NonIdealState icon="offline" title="No service status available" />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {services.map((service) => (
                  <Tag key={service.name} minimal intent={service.ok ? Intent.SUCCESS : Intent.DANGER}>
                    {service.name}
                    {service.version ? ` · ${service.version}` : ""}
                  </Tag>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

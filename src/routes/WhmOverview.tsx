import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  Button,
  Collapse,
  Pre,
  Classes,
  NonIdealState,
} from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { MetricCard } from "../components/MetricCard";
import { RecentActivityCard } from "../components/RecentActivityCard";
import { getWhmServerInfo } from "../domain/whm";
import { queryKeys } from "../domain/queryKeys";
import { describeError } from "../lib/errors";
import type { WhmConnectionContext } from "../layouts/WhmConnectionLayout";

export function WhmOverviewPage() {
  const { connection } = useOutletContext<WhmConnectionContext>();
  const [rawOpen, setRawOpen] = useState(false);

  const infoQuery = useQuery({
    queryKey: queryKeys.whmServerInfo(connection.id),
    queryFn: () => getWhmServerInfo(connection),
  });

  return (
    <div>
      <StickySubHeader
        title="Overview"
        actions={
          <Button
            small
            text="Refresh"
            loading={infoQuery.isFetching}
            onClick={() => infoQuery.refetch()}
          />
        }
      />

      <Card style={{ marginBottom: 16 }}>
        {infoQuery.isError ? (
          <NonIdealState
            icon="error"
            title="Could not read server info"
            description={describeError(infoQuery.error)}
          />
        ) : !infoQuery.data ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <MetricCard
                label="Hostname"
                value={infoQuery.data.hostname ?? "—"}
              />
              <MetricCard
                label="WHM version"
                value={infoQuery.data.whmVersion ?? "—"}
              />
              <MetricCard
                label="Load average"
                value={
                  infoQuery.data.loadAverage
                    ? infoQuery.data.loadAverage.one.toFixed(2)
                    : "—"
                }
                subtext={
                  infoQuery.data.loadAverage
                    ? `5m ${infoQuery.data.loadAverage.five.toFixed(2)} · 15m ${infoQuery.data.loadAverage.fifteen.toFixed(2)}`
                    : undefined
                }
              />
            </div>
            <Button
              minimal
              small
              text={rawOpen ? "Hide raw output" : "Show raw output"}
              onClick={() => setRawOpen((v) => !v)}
            />
            <Collapse isOpen={rawOpen}>
              <Pre style={{ marginTop: 10 }}>
                {JSON.stringify(infoQuery.data.raw, null, 2)}
              </Pre>
            </Collapse>
          </>
        )}
      </Card>

      <RecentActivityCard connectionId={connection.id} />
    </div>
  );
}

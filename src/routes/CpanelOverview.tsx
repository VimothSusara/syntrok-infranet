import { useOutletContext, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, Tag, Icon, Classes, NonIdealState, Callout, Intent } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { MetricCard } from "../components/MetricCard";
import { TileGrid } from "../components/layout/TileGrid";
import { RecentActivityCard, useConnectionActivity } from "../components/RecentActivityCard";
import {
  listCpanelDomains,
  getCpanelUsageStats,
  listSslCertificates,
  getAutosslProblems,
  getCpanelServerInfo,
  type CpanelUsageStat,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { describeError } from "../lib/errors";
import { usageIntent, certificateExpiryIntent, type UsageIntent } from "../lib/format";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

function findStat(stats: CpanelUsageStat[] | undefined, id: string) {
  return stats?.find((s) => s.id === id);
}

const tileLinkStyle = { textDecoration: "none", color: "inherit" } as const;

export function CpanelOverviewPage() {
  const { connection } = useOutletContext<CpanelConnectionContext>();
  const basePath = `/cpanel-connections/${connection.id}`;
  const activity = useConnectionActivity(connection.id);

  const domainsQuery = useQuery({ queryKey: queryKeys.cpanelDomains(connection.id), queryFn: () => listCpanelDomains(connection) });
  const statsQuery = useQuery({ queryKey: queryKeys.cpanelUsageStats(connection.id), queryFn: () => getCpanelUsageStats(connection) });
  const sslQuery = useQuery({ queryKey: queryKeys.cpanelSslCertificates(connection.id), queryFn: () => listSslCertificates(connection) });
  const problemsQuery = useQuery({ queryKey: queryKeys.cpanelAutosslProblems(connection.id), queryFn: () => getAutosslProblems(connection) });
  const serverInfoQuery = useQuery({ queryKey: queryKeys.cpanelServerInfo(connection.id), queryFn: () => getCpanelServerInfo(connection) });

  const isLoading = domainsQuery.data === undefined && statsQuery.data === undefined;
  const isRefreshing = domainsQuery.isFetching || statsQuery.isFetching || sslQuery.isFetching || problemsQuery.isFetching || serverInfoQuery.isFetching;

  function refreshAll() {
    domainsQuery.refetch();
    statsQuery.refetch();
    sslQuery.refetch();
    problemsQuery.refetch();
    serverInfoQuery.refetch();
  }

  const diskStat = findStat(statsQuery.data, "diskusage");
  const bandwidthStat = findStat(statsQuery.data, "bandwidthusage");
  const emailStat = findStat(statsQuery.data, "emailaccounts");
  const mysqlStat = findStat(statsQuery.data, "mysqldatabases");
  const postgresStat = findStat(statsQuery.data, "postgresqldatabases");

  const mysqlCount = mysqlStat ? Number(mysqlStat.countText) || 0 : null;
  const postgresCount = postgresStat ? Number(postgresStat.countText) || 0 : null;
  const totalDbCount = (mysqlCount ?? 0) + (postgresCount ?? 0);
  const dbSubtext =
    mysqlCount !== null && postgresCount !== null
      ? `${mysqlCount} MySQL · ${postgresCount} PostgreSQL`
      : mysqlCount !== null
        ? "MySQL"
        : undefined;

  let sslWorstIntent: UsageIntent = "success";
  for (const cert of sslQuery.data ?? []) {
    const i = certificateExpiryIntent(cert.notAfter);
    if (i === "danger") {
      sslWorstIntent = "danger";
      break;
    }
    if (i === "warning") sslWorstIntent = "warning";
  }
  const expiringCertCount = (sslQuery.data ?? []).filter((c) => certificateExpiryIntent(c.notAfter) !== "success").length;
  const autosslProblemCount = problemsQuery.data?.length ?? 0;
  const hasSecurityIssues = expiringCertCount > 0 || autosslProblemCount > 0;

  const services = (serverInfoQuery.data ?? []).filter((s) => s.kind === "service");

  return (
    <div>
      <StickySubHeader title="Overview" actions={<Button size="small" text="Refresh" loading={isRefreshing} onClick={refreshAll} />} />

      {domainsQuery.isError || statsQuery.isError ? (
        <NonIdealState
          icon="error"
          title="Could not load account overview"
          description={describeError(domainsQuery.error ?? statsQuery.error)}
        />
      ) : isLoading ? (
        <div className={Classes.TEXT_MUTED}>Loading…</div>
      ) : (
        <>
          <TileGrid columns={3} gap={14} style={{ marginBottom: 16 }}>
            <Link to={`${basePath}/domain`} style={tileLinkStyle}>
              <MetricCard label="Domains" value={String(domainsQuery.data?.length ?? "—")} />
            </Link>
            <Link to={`${basePath}/email`} style={tileLinkStyle}>
              <MetricCard label="Mailboxes" value={emailStat?.countText ?? "—"} />
            </Link>
            <Link to={`${basePath}/database/mysql`} style={tileLinkStyle}>
              <MetricCard label="Databases" value={String(totalDbCount)} subtext={dbSubtext} />
            </Link>
            <Link to={`${basePath}/account`} style={tileLinkStyle}>
              <MetricCard
                label="Disk used"
                value={diskStat?.countText ?? "—"}
                subtext={diskStat?.maxText ? `of ${diskStat.maxText}` : undefined}
                percent={diskStat?.percent ?? undefined}
                intent={diskStat?.percent != null ? usageIntent(diskStat.percent) : "none"}
              />
            </Link>
            <Link to={`${basePath}/statistics`} style={tileLinkStyle}>
              <MetricCard
                label="Bandwidth"
                value={bandwidthStat?.countText ?? "—"}
                subtext={bandwidthStat?.maxText ? `of ${bandwidthStat.maxText}` : undefined}
                percent={bandwidthStat?.percent ?? undefined}
                intent={bandwidthStat?.percent != null ? usageIntent(bandwidthStat.percent) : "none"}
              />
            </Link>
            <Link to={`${basePath}/ssl`} style={tileLinkStyle}>
              <MetricCard
                label="SSL Certificates"
                value={String(sslQuery.data?.length ?? "—")}
                subtext={expiringCertCount > 0 ? `${expiringCertCount} need attention` : undefined}
                intent={sslWorstIntent}
              />
            </Link>
          </TileGrid>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Server Health</h4>
              <Link to={`${basePath}/server-info`} className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
                View details
              </Link>
            </div>
            {serverInfoQuery.isError ? (
              <div className={Classes.TEXT_MUTED}>Could not load server status.</div>
            ) : serverInfoQuery.data === undefined ? (
              <div className={Classes.TEXT_MUTED}>Loading…</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {services.map((s) => (
                  <Tag key={s.name} minimal intent={s.ok ? Intent.SUCCESS : Intent.DANGER} icon={<Icon icon={s.ok ? "tick-circle" : "error"} size={12} />}>
                    {s.name}
                  </Tag>
                ))}
              </div>
            )}
          </Card>

          {hasSecurityIssues ? (
            <Callout intent={Intent.WARNING} icon="warning-sign" title="Needs attention" style={{ marginBottom: 16 }}>
              {expiringCertCount > 0 && (
                <div>
                  {expiringCertCount} certificate{expiringCertCount === 1 ? "" : "s"} expired or expiring soon —{" "}
                  <Link to={`${basePath}/ssl`}>review SSL Certificates</Link>.
                </div>
              )}
              {autosslProblemCount > 0 && (
                <div>
                  {autosslProblemCount} AutoSSL problem{autosslProblemCount === 1 ? "" : "s"} detected —{" "}
                  <Link to={`${basePath}/ssl`}>review SSL Certificates</Link>.
                </div>
              )}
            </Callout>
          ) : sslQuery.data !== undefined && problemsQuery.data !== undefined ? (
            <div className={Classes.TEXT_MUTED} style={{ fontSize: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon icon="tick-circle" size={12} />
              All certificates healthy, no AutoSSL problems
            </div>
          ) : null}

          <RecentActivityCard items={activity.items} isLoading={activity.isLoading} />
        </>
      )}
    </div>
  );
}

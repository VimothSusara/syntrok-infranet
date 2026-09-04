import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, HTMLTable, Tag, Classes, NonIdealState } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { ListActionBar } from "../components/layout/ListActionBar";
import { getCpanelBandwidth } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { describeError } from "../lib/errors";
import { formatBytes } from "../lib/format";
import { usePaginatedList } from "../hooks/usePaginatedList";
import { PaginationControls } from "../components/PaginationControls";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelStatisticsPage() {
  const { connection } = useOutletContext<CpanelConnectionContext>();

  const bandwidthQuery = useQuery({
    queryKey: queryKeys.cpanelBandwidth(connection.id),
    queryFn: () => getCpanelBandwidth(connection),
  });

  const { search, setSearch, page, totalPages, totalCount, pageItems, setPage } = usePaginatedList(
    bandwidthQuery.data ?? [],
    {
      pageSize: 10,
      searchPredicate: (record, query) => (record.domain ?? "").toLowerCase().includes(query),
    },
  );

  return (
    <div>
      <StickySubHeader
        title="Statistics"
        actions={
          <ListActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search domain…"
            onRefresh={() => bandwidthQuery.refetch()}
            refreshing={bandwidthQuery.isFetching}
          />
        }
      />

      <Card>
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 12, marginBottom: 12 }}>
          Bandwidth used this month, by domain and protocol.
        </div>
        {bandwidthQuery.isError ? (
          <NonIdealState
            icon="error"
            title="Could not load bandwidth statistics"
            description={describeError(bandwidthQuery.error)}
          />
        ) : bandwidthQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : bandwidthQuery.data.length === 0 ? (
          <NonIdealState icon="chart" title="No bandwidth data found" />
        ) : pageItems.length === 0 ? (
          <NonIdealState icon="search" title="No records match your search" />
        ) : (
          <>
            <HTMLTable compact style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Protocol</th>
                  <th>Used</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((record, index) => (
                  <tr key={`${record.domain ?? "—"}-${record.protocol}-${index}`}>
                    <td>{record.domain ?? "—"}</td>
                    <td>
                      <Tag minimal>{record.protocol}</Tag>
                    </td>
                    <td>{formatBytes(record.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
            <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

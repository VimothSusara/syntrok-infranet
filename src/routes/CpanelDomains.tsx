import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, HTMLTable, InputGroup, Tag, Classes, NonIdealState } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { listCpanelDomains } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { describeError } from "../lib/errors";
import { usePaginatedList } from "../hooks/usePaginatedList";
import { PaginationControls } from "../components/PaginationControls";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelDomainsPage() {
  const { connection } = useOutletContext<CpanelConnectionContext>();

  const domainsQuery = useQuery({
    queryKey: queryKeys.cpanelDomains(connection.id),
    queryFn: () => listCpanelDomains(connection),
  });

  const { search, setSearch, page, totalPages, totalCount, pageItems, setPage } = usePaginatedList(
    domainsQuery.data ?? [],
    {
      pageSize: 10,
      searchPredicate: (domain, query) => domain.domain.toLowerCase().includes(query),
    },
  );

  return (
    <div>
      <StickySubHeader
        title="All Domains"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <InputGroup
              leftIcon="search"
              placeholder="Search domain…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ width: 220 }}
            />
            <Button small text="Refresh" loading={domainsQuery.isFetching} onClick={() => domainsQuery.refetch()} />
          </div>
        }
      />

      <Card>
        {domainsQuery.isError ? (
          <NonIdealState icon="error" title="Could not load domains" description={describeError(domainsQuery.error)} />
        ) : domainsQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : domainsQuery.data.length === 0 ? (
          <NonIdealState icon="globe" title="No domains found" />
        ) : pageItems.length === 0 ? (
          <NonIdealState icon="search" title="No domains match your search" />
        ) : (
          <>
            <HTMLTable compact style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((domain) => (
                  <tr key={domain.domain}>
                    <td>{domain.domain}</td>
                    <td>
                      <Tag minimal>{domain.kind}</Tag>
                    </td>
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

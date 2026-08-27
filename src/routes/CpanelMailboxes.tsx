import { useOutletContext } from "react-router-dom";
import { Card, HTMLTable, Classes, NonIdealState } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { ListActionBar } from "../components/layout/ListActionBar";
import { listCpanelMailboxes } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { describeError } from "../lib/errors";
import { useServerPaginatedList } from "../hooks/useServerPaginatedList";
import { PaginationControls } from "../components/PaginationControls";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelMailboxesPage() {
  const { connection } = useOutletContext<CpanelConnectionContext>();

  const {
    search,
    setSearch,
    page,
    setPage,
    totalPages,
    totalCount,
    items: pageItems,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useServerPaginatedList(
    queryKeys.cpanelMailboxes(connection.id),
    (params) => listCpanelMailboxes(connection, params),
    { pageSize: 10 },
  );

  return (
    <div>
      <StickySubHeader
        title="All Mailboxes"
        actions={
          <ListActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search email…"
            onRefresh={() => refetch()}
            refreshing={isFetching}
          />
        }
      />

      <Card>
        {isError ? (
          <NonIdealState icon="error" title="Could not load mailboxes" description={describeError(error)} />
        ) : isLoading ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : totalCount === 0 && !search ? (
          <NonIdealState icon="envelope" title="No mailboxes found" />
        ) : pageItems.length === 0 ? (
          <NonIdealState icon="search" title="No mailboxes match your search" />
        ) : (
          <>
            <HTMLTable compact interactive style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Disk used</th>
                  <th>Quota</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((mailbox) => (
                  <tr key={mailbox.email}>
                    <td>{mailbox.email}</td>
                    <td>{mailbox.diskUsedMb} MB</td>
                    <td>{mailbox.diskQuotaMb != null ? `${mailbox.diskQuotaMb} MB` : "unlimited"}</td>
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

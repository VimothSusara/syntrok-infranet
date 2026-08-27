import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Button,
  HTMLTable,
  Tag,
  Intent,
  NonIdealState,
  Classes,
  Alert,
  FormGroup,
  InputGroup,
} from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { ListActionBar } from "../components/layout/ListActionBar";
import {
  listWhmAccounts,
  suspendWhmAccount,
  unsuspendWhmAccount,
  type WhmAccount,
} from "../domain/whm";
import { queryKeys } from "../domain/queryKeys";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { WhmConnectionContext } from "../layouts/WhmConnectionLayout";
import { usePaginatedList } from "../hooks/usePaginatedList";
import { PaginationControls } from "../components/PaginationControls";

export function WhmAccountsPage() {
  const { connection, resourceId, workspaceId } =
    useOutletContext<WhmConnectionContext>();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{
    account: WhmAccount;
    action: "suspend" | "unsuspend";
  } | null>(null);
  const [reason, setReason] = useState("");

  const accountsQuery = useQuery({
    queryKey: queryKeys.whmAccounts(connection.id),
    queryFn: () => listWhmAccounts(connection),
  });

  const {
    search,
    setSearch,
    page,
    totalPages,
    totalCount,
    pageItems,
    setPage,
  } = usePaginatedList(accountsQuery.data ?? [], {
    pageSize: 10,
    searchPredicate: (account, query) =>
      account.domain.toLowerCase().includes(query) ||
      account.user.toLowerCase().includes(query),
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      if (!pending || !resourceId) throw new Error("Not ready yet");
      if (pending.action === "suspend") {
        await suspendWhmAccount(
          connection,
          resourceId,
          pending.account.user,
          reason.trim() || undefined,
        );
      } else {
        await unsuspendWhmAccount(connection, resourceId, pending.account.user);
      }
    },
    onSuccess: () => {
      showSuccess(
        pending?.action === "suspend"
          ? `Suspended ${pending.account.user}`
          : `Unsuspended ${pending?.account.user}`,
      );
      invalidateConnectionState(queryClient, {
        connectionId: connection.id,
        environmentId: connection.environmentId,
        workspaceId,
      });
    },
    onError: (err) =>
      showError(
        `${pending?.action === "suspend" ? "Suspend" : "Unsuspend"} failed: ${describeError(err)}`,
      ),
    onSettled: () => {
      setPending(null);
      setReason("");
    },
  });

  return (
    <div>
      <StickySubHeader
        title="Accounts"
        actions={
          <ListActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search domain or user…"
            onRefresh={() => accountsQuery.refetch()}
            refreshing={accountsQuery.isFetching}
          />
        }
      />

      <Card>
        {accountsQuery.isError ? (
          <NonIdealState
            icon="error"
            title="Could not load accounts"
            description={describeError(accountsQuery.error)}
          />
        ) : accountsQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : accountsQuery.data.length === 0 ? (
          <NonIdealState icon="search" title="No accounts found" />
        ) : pageItems.length === 0 ? (
          <NonIdealState icon="search" title="No accounts match your search" />
        ) : (
          <>
            <HTMLTable compact interactive style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>User</th>
                  <th>Disk</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((account) => (
                  <tr key={account.user}>
                    <td>{account.domain}</td>
                    <td>{account.user}</td>
                    <td>
                      {account.diskUsed} / {account.diskLimit}
                    </td>
                    <td>
                      <Tag
                        intent={
                          account.suspended ? Intent.WARNING : Intent.SUCCESS
                        }
                        minimal
                      >
                        {account.suspended ? "suspended" : "active"}
                      </Tag>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        size="small"
                        intent={
                          account.suspended ? Intent.SUCCESS : Intent.DANGER
                        }
                        text={account.suspended ? "Unsuspend" : "Suspend"}
                        onClick={() =>
                          setPending({
                            account,
                            action: account.suspended ? "unsuspend" : "suspend",
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Alert
        isOpen={pending !== null}
        icon="warning-sign"
        intent={pending?.action === "suspend" ? Intent.DANGER : Intent.PRIMARY}
        confirmButtonText={
          pending?.action === "suspend" ? "Suspend" : "Unsuspend"
        }
        cancelButtonText="Cancel"
        loading={suspendMutation.isPending}
        onConfirm={() => suspendMutation.mutate()}
        onCancel={() => {
          setPending(null);
          setReason("");
        }}
        canOutsideClickCancel
      >
        <p>
          {pending?.action === "suspend" ? "Suspend" : "Unsuspend"}{" "}
          <strong>{pending?.account.user}</strong> ({pending?.account.domain})?
        </p>
        {pending?.action === "suspend" && (
          <FormGroup label="Reason (optional)">
            <InputGroup
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
          </FormGroup>
        )}
      </Alert>
    </div>
  );
}

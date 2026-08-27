import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, HTMLTable, Tag, Classes, NonIdealState, Alert, Intent, FormGroup, Button } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { ListActionBar } from "../components/layout/ListActionBar";
import { DocumentRootInput } from "../components/DocumentRootInput";
import {
  listCpanelDomains,
  deleteCpanelDomain,
  changeCpanelDocumentRoot,
  getCpanelDomainDetail,
  type CpanelDomain,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { usePaginatedList } from "../hooks/usePaginatedList";
import { PaginationControls } from "../components/PaginationControls";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelDomainsPage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();

  const [removeTarget, setRemoveTarget] = useState<CpanelDomain | null>(null);
  const [docRootTarget, setDocRootTarget] = useState<CpanelDomain | null>(null);
  const [newDocRoot, setNewDocRoot] = useState("");
  const [docRootConfirmOpen, setDocRootConfirmOpen] = useState(false);

  const domainsQuery = useQuery({
    queryKey: queryKeys.cpanelDomains(connection.id),
    queryFn: () => listCpanelDomains(connection),
  });

  const domainDetailQuery = useQuery({
    queryKey: queryKeys.cpanelDomainDetail(connection.id, docRootTarget?.domain ?? ""),
    queryFn: () => getCpanelDomainDetail(connection, docRootTarget!.domain),
    enabled: docRootTarget !== null,
  });

  const { search, setSearch, page, totalPages, totalCount, pageItems, setPage } = usePaginatedList(
    domainsQuery.data ?? [],
    {
      pageSize: 10,
      searchPredicate: (domain, query) => domain.domain.toLowerCase().includes(query),
    },
  );

  const removeMutation = useMutation({
    mutationFn: (domain: CpanelDomain) => {
      if (!resourceId) throw new Error("Not ready yet");
      return deleteCpanelDomain(connection, resourceId, domain);
    },
    onSuccess: (_result, domain) => {
      showSuccess(`Removed ${domain.domain}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.cpanelDomains(connection.id) });
    },
    onError: (err) => showError(`Failed to remove domain: ${describeError(err)}`),
    onSettled: () => setRemoveTarget(null),
  });

  const docRootMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      if (!docRootTarget) throw new Error("No domain selected");
      return changeCpanelDocumentRoot(connection, resourceId, docRootTarget.domain, newDocRoot.trim());
    },
    onSuccess: () => {
      showSuccess(`Document root updated for ${docRootTarget?.domain}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.cpanelDomains(connection.id) });
    },
    onError: (err) => showError(`Failed to change document root: ${describeError(err)}`),
    onSettled: () => {
      setDocRootTarget(null);
      setNewDocRoot("");
      setDocRootConfirmOpen(false);
    },
  });

  const canChangeDocRoot = (domain: CpanelDomain) => domain.kind === "addon" || domain.kind === "subdomain";
  const canRemove = (domain: CpanelDomain) => domain.kind !== "main";

  return (
    <div>
      <StickySubHeader
        title="All Domains"
        actions={
          <ListActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search domain…"
            onRefresh={() => domainsQuery.refetch()}
            refreshing={domainsQuery.isFetching}
          />
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((domain) => (
                  <tr key={domain.domain}>
                    <td>{domain.domain}</td>
                    <td>
                      <Tag minimal>{domain.kind}</Tag>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {canChangeDocRoot(domain) && (
                          <Button
                            size="small"
                            variant="minimal"
                            icon="folder-shared"
                            text="Doc root"
                            onClick={() => {
                              setDocRootTarget(domain);
                              setNewDocRoot("");
                              setDocRootConfirmOpen(false);
                            }}
                          />
                        )}
                        {canRemove(domain) && (
                          <Button
                            size="small"
                            variant="minimal"
                            icon="trash"
                            intent={Intent.DANGER}
                            text="Remove"
                            onClick={() => setRemoveTarget(domain)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
            <PaginationControls page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Alert
        isOpen={removeTarget !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Remove"
        cancelButtonText="Cancel"
        loading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Remove <strong>{removeTarget?.domain}</strong>?
          {removeTarget?.kind === "addon" &&
            " This also removes the subdomain it was parked on, and its FTP account."}
          {removeTarget?.kind === "subdomain" &&
            " This does not delete its files — only the subdomain configuration."}
          {removeTarget?.kind === "parked" && " This only removes the alias, not any underlying content."}
        </p>
      </Alert>

      <Alert
        isOpen={docRootTarget !== null && !docRootConfirmOpen}
        icon="folder-shared"
        intent={Intent.PRIMARY}
        confirmButtonText="Continue"
        cancelButtonText="Cancel"
        onConfirm={() => {
          if (!newDocRoot.trim()) {
            showError("Enter a document root.");
            return;
          }
          setDocRootConfirmOpen(true);
        }}
        onCancel={() => {
          setDocRootTarget(null);
          setNewDocRoot("");
        }}
        canOutsideClickCancel
      >
        <p>
          Change the document root for <strong>{docRootTarget?.domain}</strong>. The target directory must already
          exist — cPanel does not create it for this operation.
        </p>
        <p className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
          {domainDetailQuery.isLoading
            ? "Loading current document root…"
            : domainDetailQuery.isError
              ? `Could not load current document root: ${describeError(domainDetailQuery.error)}`
              : `Current: ${domainDetailQuery.data?.documentRoot ?? "unknown"}`}
        </p>
        <FormGroup label="New document root">
          <DocumentRootInput
            connection={connection}
            value={newDocRoot}
            onChange={setNewDocRoot}
            placeholder="public_html/example"
          />
        </FormGroup>
      </Alert>

      <Alert
        isOpen={docRootConfirmOpen}
        icon="warning-sign"
        intent={Intent.WARNING}
        confirmButtonText="Yes, change it"
        cancelButtonText="Back"
        loading={docRootMutation.isPending}
        onConfirm={() => docRootMutation.mutate()}
        onCancel={() => setDocRootConfirmOpen(false)}
        canOutsideClickCancel
      >
        <p>
          Confirm: change <strong>{docRootTarget?.domain}</strong>'s document root
          {domainDetailQuery.data?.documentRoot ? (
            <>
              {" "}
              from <code>{domainDetailQuery.data.documentRoot}</code>
            </>
          ) : null}{" "}
          to <code>{newDocRoot.trim()}</code>? This changes what content the domain serves immediately.
        </p>
      </Alert>
    </div>
  );
}

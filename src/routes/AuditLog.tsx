import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  H2,
  HTMLTable,
  Tag,
  Intent,
  HTMLSelect,
  InputGroup,
  Button,
  Spinner,
  NonIdealState,
  Classes,
} from "@blueprintjs/core";
import { listAllAuditEvents } from "../domain/audit";
import { queryKeys } from "../domain/queryKeys";
import { PageHeader } from "../components/PageHeader";

const PAGE_SIZE = 25;

export function AuditLogPage() {
  const [resultFilter, setResultFilter] = useState<
    "all" | "success" | "failure"
  >("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = { page, pageSize: PAGE_SIZE, search, result: resultFilter };

  const auditQuery = useQuery({
    queryKey: queryKeys.allAuditEvents(params),
    queryFn: () => listAllAuditEvents(params),
  });

  const totalPages = auditQuery.data
    ? Math.max(1, Math.ceil(auditQuery.data.total / PAGE_SIZE))
    : 1;

  return (
    <div>
      <PageHeader title="Audit Log" />
      <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
        <InputGroup
          placeholder="Search action, host, project…"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          style={{ width: 260 }}
        />
        <HTMLSelect
          value={resultFilter}
          onChange={(e) => {
            setResultFilter(
              e.currentTarget.value as "all" | "success" | "failure",
            );
            setPage(1);
          }}
          options={[
            { label: "All results", value: "all" },
            { label: "Success only", value: "success" },
            { label: "Failure only", value: "failure" },
          ]}
        />
      </div>

      <Card>
        {auditQuery.isLoading && <Spinner size={20} />}
        {auditQuery.data?.items.length === 0 && (
          <NonIdealState icon="history" title="No matching events" />
        )}
        {auditQuery.data && auditQuery.data.items.length > 0 && (
          <>
            <HTMLTable compact style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {auditQuery.data.items.map((event) => (
                  <tr key={event.id}>
                    <td
                      style={{
                        whiteSpace: "nowrap",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {new Date(event.created_at).toLocaleString()}
                    </td>
                    <td>{event.action}</td>
                    <td>
                      {event.projectName ?? "—"}
                      {event.connectionHost ? ` · ${event.connectionHost}` : ""}
                    </td>
                    <td>
                      <Tag
                        intent={
                          event.result === "success"
                            ? Intent.SUCCESS
                            : Intent.DANGER
                        }
                        minimal
                      >
                        {event.result}
                      </Tag>
                    </td>
                    <td
                      className={Classes.TEXT_MUTED}
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                    >
                      {event.detail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 14,
              }}
            >
              <div className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
                {auditQuery.data.total} total
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button
                  small
                  text="Previous"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                />
                <div style={{ fontSize: 12 }}>
                  Page {page} of {totalPages}
                </div>
                <Button
                  small
                  text="Next"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                />
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

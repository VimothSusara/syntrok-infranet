import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Button,
  HTMLTable,
  HTMLSelect,
  Tag,
  Tooltip,
  Classes,
  NonIdealState,
  Alert,
  Dialog,
  Intent,
  FormGroup,
  InputGroup,
  TextArea,
} from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import {
  listCpanelDomains,
  getDnsZone,
  addDnsRecord,
  editDnsRecord,
  removeDnsRecord,
  type CpanelDnsRecord,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];

type RecordDialogState = { mode: "add" } | { mode: "edit"; record: CpanelDnsRecord } | null;

export function CpanelDnsPage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();

  const domainsQuery = useQuery({ queryKey: queryKeys.cpanelDomains(connection.id), queryFn: () => listCpanelDomains(connection) });
  const zoneCandidates = (domainsQuery.data ?? []).filter((d) => d.kind === "main" || d.kind === "addon");

  const [zone, setZone] = useState("");
  useEffect(() => {
    if (!zone && zoneCandidates.length > 0) setZone(zoneCandidates[0].domain);
  }, [zone, zoneCandidates]);

  const zoneQuery = useQuery({
    queryKey: queryKeys.cpanelDnsZone(connection.id, zone),
    queryFn: () => getDnsZone(connection, zone),
    enabled: zone !== "",
  });

  function invalidateZone() {
    queryClient.invalidateQueries({ queryKey: queryKeys.cpanelDnsZone(connection.id, zone) });
  }

  const [dialog, setDialog] = useState<RecordDialogState>(null);
  const [name, setName] = useState("");
  const [recordType, setRecordType] = useState("A");
  const [ttl, setTtl] = useState("14400");
  const [dataText, setDataText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CpanelDnsRecord | null>(null);

  function openAdd() {
    setName("");
    setRecordType("A");
    setTtl("14400");
    setDataText("");
    setDialog({ mode: "add" });
  }

  function openEdit(record: CpanelDnsRecord) {
    setName(record.name);
    setRecordType(record.recordType);
    setTtl(String(record.ttl));
    setDataText(record.data.join("\n"));
    setDialog({ mode: "edit", record });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!resourceId || !dialog || !zoneQuery.data) throw new Error("Not ready yet");
      const data = dataText.split("\n").map((line) => line.trim()).filter(Boolean);
      const input = { name: name.trim(), recordType, ttl: Number(ttl) || 0, data };
      if (dialog.mode === "add") {
        return addDnsRecord(connection, resourceId, zone, zoneQuery.data.serial, input);
      }
      return editDnsRecord(connection, resourceId, zone, zoneQuery.data.serial, dialog.record.lineIndex, input);
    },
    onSuccess: () => {
      showSuccess(dialog?.mode === "add" ? `Added ${name.trim()}` : `Updated ${name.trim()}`);
      invalidateZone();
    },
    onError: (err) => showError(`Failed to save record: ${describeError(err)}`),
    onSettled: () => setDialog(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (record: CpanelDnsRecord) => {
      if (!resourceId || !zoneQuery.data) throw new Error("Not ready yet");
      return removeDnsRecord(connection, resourceId, zone, zoneQuery.data.serial, record);
    },
    onSuccess: (_r, record) => {
      showSuccess(`Removed ${record.name} (${record.recordType})`);
      invalidateZone();
    },
    onError: (err) => showError(`Failed to remove record: ${describeError(err)}`),
    onSettled: () => setDeleteTarget(null),
  });

  const trimmedName = name.trim();
  const trimmedData = dataText.split("\n").map((l) => l.trim()).filter(Boolean);
  const isFormValid = trimmedName.length > 0 && trimmedData.length > 0 && Number(ttl) > 0;

  return (
    <div>
      <StickySubHeader
        title="DNS"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HTMLSelect
              value={zone}
              onChange={(e) => setZone(e.currentTarget.value)}
              options={zoneCandidates.map((d) => d.domain)}
              disabled={zoneCandidates.length === 0}
            />
            <Button size="small" icon="add" text="Add Record" disabled={!zoneQuery.data} onClick={openAdd} />
            <Button size="small" text="Refresh" loading={zoneQuery.isFetching} onClick={() => zoneQuery.refetch()} />
          </div>
        }
      />

      <Card>
        {domainsQuery.isError ? (
          <NonIdealState icon="error" title="Could not load domains" description={describeError(domainsQuery.error)} />
        ) : domainsQuery.data !== undefined && zoneCandidates.length === 0 ? (
          <NonIdealState icon="map" title="No DNS-eligible domains found" />
        ) : zoneQuery.isError ? (
          <NonIdealState icon="error" title="Could not load DNS zone" description={describeError(zoneQuery.error)} />
        ) : zoneQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : zoneQuery.data.records.length === 0 ? (
          <NonIdealState icon="map" title="No records found" />
        ) : (
          <HTMLTable compact style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>TTL</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zoneQuery.data.records.map((record) => {
                const valueText = record.data.join(", ");
                return (
                  <tr key={record.lineIndex}>
                    <td>{record.name}</td>
                    <td>
                      <Tag minimal>{record.recordType}</Tag>
                    </td>
                    <td>{record.ttl}</td>
                    <td style={{ maxWidth: 320 }}>
                      <Tooltip content={valueText} disabled={valueText.length <= 60}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {valueText}
                        </span>
                      </Tooltip>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Button size="small" variant="minimal" icon="edit" onClick={() => openEdit(record)} />
                        <Button
                          size="small"
                          variant="minimal"
                          icon="trash"
                          intent={Intent.DANGER}
                          onClick={() => setDeleteTarget(record)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      <Dialog
        isOpen={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.mode === "edit" ? "Edit Record" : "Add Record"}
        style={{ width: 560 }}
      >
        <div style={{ padding: 24 }}>
          <FormGroup label="Name">
            <InputGroup fill value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="www" />
          </FormGroup>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormGroup label="Type">
              <HTMLSelect fill value={recordType} onChange={(e) => setRecordType(e.currentTarget.value)} options={RECORD_TYPES} />
            </FormGroup>
            <FormGroup label="TTL">
              <InputGroup fill value={ttl} onChange={(e) => setTtl(e.currentTarget.value)} />
            </FormGroup>
          </div>
          <FormGroup
            label="Data"
            helperText="One value per line. MX: priority line, then exchange host. SRV: priority, weight, port, target — one per line."
          >
            <TextArea
              fill
              value={dataText}
              onChange={(e) => setDataText(e.currentTarget.value)}
              style={{ fontFamily: "monospace", fontSize: 12, minHeight: 100 }}
            />
          </FormGroup>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button text="Cancel" onClick={() => setDialog(null)} />
            <Button
              text={dialog?.mode === "edit" ? "Save" : "Add"}
              intent={Intent.PRIMARY}
              loading={saveMutation.isPending}
              disabled={!isFormValid}
              onClick={() => saveMutation.mutate()}
            />
          </div>
        </div>
      </Dialog>

      <Alert
        isOpen={deleteTarget !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Remove"
        cancelButtonText="Cancel"
        loading={deleteMutation.isPending}
        style={{ width: 440 }}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Remove the <strong>{deleteTarget?.recordType}</strong> record for <strong>{deleteTarget?.name}</strong>?
          This takes effect immediately.
        </p>
      </Alert>
    </div>
  );
}

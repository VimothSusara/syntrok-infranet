import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Button,
  HTMLTable,
  HTMLSelect,
  Tag,
  Classes,
  NonIdealState,
  Alert,
  Dialog,
  Divider,
  Intent,
  FormGroup,
  TextArea,
} from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import {
  listSslCertificates,
  listSslCapableDomains,
  installSslCertificate,
  deleteSslCertificate,
  getAutosslProblems,
  startAutosslCheck,
  isAutosslCheckInProgress,
  type CpanelSslCertificate,
} from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { certificateExpiryIntent } from "../lib/format";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelSslPage() {
  const { connection, resourceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();

  const certsQuery = useQuery({ queryKey: queryKeys.cpanelSslCertificates(connection.id), queryFn: () => listSslCertificates(connection) });
  const problemsQuery = useQuery({ queryKey: queryKeys.cpanelAutosslProblems(connection.id), queryFn: () => getAutosslProblems(connection) });
  const domainsQuery = useQuery({ queryKey: queryKeys.cpanelSslCapableDomains(connection.id), queryFn: () => listSslCapableDomains(connection) });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: queryKeys.cpanelSslCertificates(connection.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.cpanelAutosslProblems(connection.id) });
  }

  const [removeTarget, setRemoveTarget] = useState<CpanelSslCertificate | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [installDomain, setInstallDomain] = useState("");
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [cabundlePem, setCabundlePem] = useState("");
  const [checking, setChecking] = useState(false);

  const removeMutation = useMutation({
    mutationFn: (cert: CpanelSslCertificate) => {
      if (!resourceId) throw new Error("Not ready yet");
      return deleteSslCertificate(connection, resourceId, cert.domains[0]);
    },
    onSuccess: (_r, cert) => {
      showSuccess(`Removed certificate for ${cert.domains[0]}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to remove certificate: ${describeError(err)}`),
    onSettled: () => setRemoveTarget(null),
  });

  const installMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return installSslCertificate(connection, resourceId, installDomain, certPem.trim(), keyPem.trim(), cabundlePem.trim() || undefined);
    },
    onSuccess: () => {
      showSuccess(`Installed certificate for ${installDomain}`);
      invalidateAll();
    },
    onError: (err) => showError(`Failed to install certificate: ${describeError(err)}`),
    onSettled: () => {
      setInstallOpen(false);
      setInstallDomain("");
      setCertPem("");
      setKeyPem("");
      setCabundlePem("");
    },
  });

  const checkQuery = useQuery({
    queryKey: ["cpanelAutosslCheckInProgress", connection.id],
    queryFn: () => isAutosslCheckInProgress(connection),
    enabled: checking,
    refetchInterval: (query) => (query.state.data ? 4000 : false),
  });

  // Once polling reports the check finished, refresh the real data it
  // affects and stop polling.
  useEffect(() => {
    if (checking && checkQuery.data === false) {
      setChecking(false);
      invalidateAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, checkQuery.data]);

  const startCheckMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return startAutosslCheck(connection, resourceId);
    },
    onSuccess: () => {
      showSuccess("AutoSSL check started");
      setChecking(true);
    },
    onError: (err) => showError(`Failed to start AutoSSL check: ${describeError(err)}`),
  });

  return (
    <div>
      <StickySubHeader
        title="SSL Certificates"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="small" icon="add" text="Install Certificate" onClick={() => setInstallOpen(true)} />
            <Button
              size="small"
              loading={certsQuery.isFetching || problemsQuery.isFetching}
              text="Refresh"
              onClick={() => {
                certsQuery.refetch();
                problemsQuery.refetch();
              }}
            />
          </div>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Installed Certificates</h4>
        {certsQuery.isError ? (
          <NonIdealState icon="error" title="Could not load certificates" description={describeError(certsQuery.error)} />
        ) : certsQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : certsQuery.data.length === 0 ? (
          <NonIdealState icon="lock" title="No certificates found" />
        ) : (
          <HTMLTable compact style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Domains</th>
                <th>Issuer</th>
                <th>Expires</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {certsQuery.data.map((cert) => (
                <tr key={cert.id}>
                  <td>
                    {cert.domains.map((d) => (
                      <Tag key={d} minimal style={{ marginRight: 4 }}>
                        {d}
                      </Tag>
                    ))}
                  </td>
                  <td>{cert.issuerCommonName || "—"}</td>
                  <td>
                    <Tag intent={certificateExpiryIntent(cert.notAfter)} minimal>
                      {cert.notAfter ? new Date(cert.notAfter).toLocaleDateString() : "unknown"}
                    </Tag>
                  </td>
                  <td>
                    {cert.isAutoSsl && (
                      <Tag minimal style={{ marginRight: 4 }}>
                        AutoSSL
                      </Tag>
                    )}
                    {cert.isSelfSigned && (
                      <Tag minimal intent={Intent.WARNING} style={{ marginRight: 4 }}>
                        Self-signed
                      </Tag>
                    )}
                    {cert.validationType && <Tag minimal>{cert.validationType.toUpperCase()}</Tag>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button size="small" variant="minimal" icon="trash" intent={Intent.DANGER} text="Remove" onClick={() => setRemoveTarget(cert)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>AutoSSL</h4>
          <Button
            size="small"
            icon="refresh"
            text="Run AutoSSL Check"
            loading={startCheckMutation.isPending || checking}
            onClick={() => startCheckMutation.mutate()}
          />
        </div>
        {problemsQuery.isError ? (
          <NonIdealState icon="error" title="Could not load AutoSSL status" description={describeError(problemsQuery.error)} />
        ) : problemsQuery.data === undefined ? (
          <div className={Classes.TEXT_MUTED}>Loading…</div>
        ) : problemsQuery.data.length === 0 ? (
          <NonIdealState icon="tick-circle" title="No AutoSSL problems detected" />
        ) : (
          <HTMLTable compact style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {problemsQuery.data.map((p) => (
                <tr key={p.domain}>
                  <td>{p.domain}</td>
                  <td className={Classes.TEXT_MUTED} style={{ fontSize: 12 }}>
                    {p.problem}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      <Alert
        isOpen={removeTarget !== null}
        icon="trash"
        intent={Intent.DANGER}
        confirmButtonText="Remove"
        cancelButtonText="Cancel"
        loading={removeMutation.isPending}
        style={{ width: 460 }}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
        canOutsideClickCancel
      >
        <p>
          Remove the certificate for <strong>{removeTarget?.domains.join(", ")}</strong>? This leaves the domain
          without HTTPS until a new certificate is installed (or AutoSSL provides one).
        </p>
      </Alert>

      <Dialog isOpen={installOpen} onClose={() => setInstallOpen(false)} title="Install Certificate" style={{ width: 640 }}>
        <div style={{ padding: 24 }}>
          <FormGroup label="Domain">
            <HTMLSelect
              fill
              value={installDomain}
              onChange={(e) => setInstallDomain(e.currentTarget.value)}
              options={["", ...(domainsQuery.data ?? [])]}
            />
          </FormGroup>

          <Divider style={{ margin: "8px 0 16px" }} />

          <FormGroup label="Certificate (PEM)">
            <TextArea fill value={certPem} onChange={(e) => setCertPem(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 12, minHeight: 100 }} />
          </FormGroup>
          <FormGroup label="Private Key (PEM)">
            <TextArea fill value={keyPem} onChange={(e) => setKeyPem(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 12, minHeight: 100 }} />
          </FormGroup>
          <FormGroup label="CA Bundle (PEM, optional)">
            <TextArea fill value={cabundlePem} onChange={(e) => setCabundlePem(e.currentTarget.value)} style={{ fontFamily: "monospace", fontSize: 12, minHeight: 80 }} />
          </FormGroup>

          <Divider style={{ margin: "8px 0 16px" }} />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button text="Cancel" onClick={() => setInstallOpen(false)} />
            <Button
              text="Install"
              intent={Intent.PRIMARY}
              loading={installMutation.isPending}
              onClick={() => {
                if (!installDomain || !certPem.trim() || !keyPem.trim()) {
                  showError("Select a domain and provide both the certificate and private key.");
                  return;
                }
                installMutation.mutate();
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

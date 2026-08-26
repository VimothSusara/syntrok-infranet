import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Alert, FormGroup, InputGroup, Classes, NonIdealState, Intent } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { MetricCard } from "../components/MetricCard";
import { RecentActivityCard } from "../components/RecentActivityCard";
import { getCpanelAccountInfo, changeCpanelPassword } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelAccountPage() {
  const { connection, resourceId, workspaceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const infoQuery = useQuery({
    queryKey: queryKeys.cpanelAccountInfo(connection.id),
    queryFn: () => getCpanelAccountInfo(connection),
  });

  const passwordMutation = useMutation({
    mutationFn: () => {
      if (!resourceId) throw new Error("Not ready yet");
      return changeCpanelPassword(connection, resourceId, oldPassword, newPassword);
    },
    onSuccess: () => {
      showSuccess("Password changed");
      invalidateConnectionState(queryClient, {
        connectionId: connection.id,
        environmentId: connection.environmentId,
        workspaceId,
      });
    },
    onError: (err) => showError(`Password change failed: ${describeError(err)}`),
    onSettled: () => {
      setConfirmOpen(false);
      setOldPassword("");
      setNewPassword("");
    },
  });

  return (
    <div>
      <StickySubHeader
        title="Account"
        actions={<Button small text="Refresh" loading={infoQuery.isFetching} onClick={() => infoQuery.refetch()} />}
      />

      <Card style={{ marginBottom: 16 }}>
        {infoQuery.isError ? (
          <NonIdealState icon="error" title="Could not read account info" description={describeError(infoQuery.error)} />
        ) : !infoQuery.data ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
            <MetricCard
              label="Disk used"
              value={infoQuery.data.megabytesUsed != null ? `${infoQuery.data.megabytesUsed} MB` : "—"}
            />
            <MetricCard
              label="Disk limit"
              value={infoQuery.data.megabytesLimit != null ? `${infoQuery.data.megabytesLimit} MB` : "unlimited"}
            />
          </div>
        )}
        <Button text="Change password" onClick={() => setConfirmOpen(true)} />
      </Card>

      <RecentActivityCard connectionId={connection.id} />

      <Alert
        isOpen={confirmOpen}
        icon="key"
        intent={Intent.PRIMARY}
        confirmButtonText="Change password"
        cancelButtonText="Cancel"
        loading={passwordMutation.isPending}
        onConfirm={() => passwordMutation.mutate()}
        onCancel={() => {
          setConfirmOpen(false);
          setOldPassword("");
          setNewPassword("");
        }}
        canOutsideClickCancel
      >
        <p>Change the password for this cPanel account? Use a strong password — this affects real login access.</p>
        <FormGroup label="Current password">
          <InputGroup type="password" value={oldPassword} onChange={(e) => setOldPassword(e.currentTarget.value)} />
        </FormGroup>
        <FormGroup label="New password">
          <InputGroup type="password" value={newPassword} onChange={(e) => setNewPassword(e.currentTarget.value)} />
        </FormGroup>
      </Alert>
    </div>
  );
}

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Alert, FormGroup, InputGroup, Classes, NonIdealState, Intent } from "@blueprintjs/core";
import { StickySubHeader } from "../components/StickySubHeader";
import { MetricCard } from "../components/MetricCard";
import { TileGrid } from "../components/layout/TileGrid";
import { PasswordField } from "../components/PasswordField";
import { RecentActivityCard, useConnectionActivity } from "../components/RecentActivityCard";
import { getCpanelAccountInfo, getCpanelUsageStats, changeCpanelPassword } from "../domain/cpanel";
import { queryKeys } from "../domain/queryKeys";
import { invalidateConnectionState } from "../lib/queryInvalidation";
import { showSuccess, showError } from "../lib/toaster";
import { describeError } from "../lib/errors";
import { usageIntent } from "../lib/format";
import type { CpanelConnectionContext } from "../layouts/CpanelConnectionLayout";

export function CpanelAccountPage() {
  const { connection, resourceId, workspaceId } = useOutletContext<CpanelConnectionContext>();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordReady, setNewPasswordReady] = useState(true);

  const infoQuery = useQuery({
    queryKey: queryKeys.cpanelAccountInfo(connection.id),
    queryFn: () => getCpanelAccountInfo(connection),
  });

  const activity = useConnectionActivity(connection.id);

  const statsQuery = useQuery({
    queryKey: queryKeys.cpanelUsageStats(connection.id),
    queryFn: () => getCpanelUsageStats(connection),
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
      setNewPasswordReady(true);
    },
  });

  return (
    <div>
      <StickySubHeader
        title="Account"
        actions={
          <Button
            size="small"
            text="Refresh"
            loading={infoQuery.isFetching || statsQuery.isFetching}
            onClick={() => {
              infoQuery.refetch();
              statsQuery.refetch();
            }}
          />
        }
      />

      <Card style={{ marginBottom: 16 }}>
        {infoQuery.isError ? (
          <NonIdealState icon="error" title="Could not read account info" description={describeError(infoQuery.error)} />
        ) : !infoQuery.data ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : (
          <TileGrid columns={4} style={{ marginBottom: 14 }}>
            <MetricCard
              label="Disk used"
              value={infoQuery.data.megabytesUsed != null ? `${infoQuery.data.megabytesUsed} MB` : "—"}
            />
            <MetricCard
              label="Disk limit"
              value={
                infoQuery.data.megabytesLimit != null && infoQuery.data.megabytesLimit > 0
                  ? `${infoQuery.data.megabytesLimit} MB`
                  : "unlimited"
              }
            />
            <MetricCard
              label="Disk remaining"
              value={
                infoQuery.data.megabytesLimit === 0
                  ? "unlimited"
                  : infoQuery.data.megabytesRemain != null
                    ? `${infoQuery.data.megabytesRemain} MB`
                    : "—"
              }
            />
            <MetricCard
              label="Inodes used"
              value={
                infoQuery.data.inodeLimit === 0
                  ? `${infoQuery.data.inodesUsed ?? "—"} (unlimited)`
                  : infoQuery.data.inodesUsed != null && infoQuery.data.inodeLimit != null
                    ? `${infoQuery.data.inodesUsed} / ${infoQuery.data.inodeLimit}`
                    : "—"
              }
            />
          </TileGrid>
        )}
        <Button text="Change password" onClick={() => setConfirmOpen(true)} />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className={Classes.TEXT_MUTED} style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 10 }}>
          Usage
        </div>
        {statsQuery.isError ? (
          <NonIdealState icon="error" title="Could not read usage stats" description={describeError(statsQuery.error)} />
        ) : !statsQuery.data ? (
          <div className={Classes.TEXT_MUTED}>Not loaded yet.</div>
        ) : (
          <TileGrid columns={3}>
            {statsQuery.data.map((stat) => (
              <MetricCard
                key={stat.id}
                label={stat.label}
                value={stat.countText}
                subtext={stat.maxText ? `of ${stat.maxText}` : undefined}
                percent={stat.percent ?? undefined}
                intent={stat.percent != null ? usageIntent(stat.percent) : "none"}
              />
            ))}
          </TileGrid>
        )}
      </Card>

      <RecentActivityCard items={activity.items} isLoading={activity.isLoading} />

      <Alert
        isOpen={confirmOpen}
        icon="key"
        intent={Intent.PRIMARY}
        confirmButtonText="Change password"
        cancelButtonText="Cancel"
        loading={passwordMutation.isPending}
        style={{ width: 480 }}
        onConfirm={() => {
          if (!newPasswordReady) {
            showError("Confirm you've copied the generated password first.");
            return;
          }
          passwordMutation.mutate();
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setOldPassword("");
          setNewPassword("");
          setNewPasswordReady(true);
        }}
        canOutsideClickCancel
      >
        <p>Change the password for this cPanel account? Use a strong password — this affects real login access.</p>
        <FormGroup label="Current password">
          <InputGroup type="password" value={oldPassword} onChange={(e) => setOldPassword(e.currentTarget.value)} />
        </FormGroup>
        <FormGroup label="New password">
          <PasswordField value={newPassword} onChange={setNewPassword} onReadyChange={setNewPasswordReady} />
        </FormGroup>
      </Alert>
    </div>
  );
}

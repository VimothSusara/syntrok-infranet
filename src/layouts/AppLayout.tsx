import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Spinner,
  NonIdealState,
  Button,
  Alert,
  Intent,
  Classes,
} from "@blueprintjs/core";
import classNames from "clsx";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffectiveDarkMode } from "../lib/theme";
import { ensureDefaultWorkspace } from "../domain/workspaces";
import { isMigrationChecksumError, repairMigrationChecksums } from "../domain/dbRepair";
import { queryKeys } from "../domain/queryKeys";
import { Sidebar } from "../components/Sidebar";
import { CenteredShell } from "../components/layout/CenteredShell";
import { useAutoUpdateCheck } from "../lib/useAutoUpdateChack";
import { showError, showSuccess } from "../lib/toaster";
import { describeError } from "../lib/errors";

export interface LayoutContext {
  workspaceId: string;
}

export function AppLayout() {
  const isDark = useEffectiveDarkMode();
  const shellBackground = {
    backgroundColor: "var(--bp-surface-background-color-default-rest)",
  };
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const {
    data: workspace,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.workspace(),
    queryFn: ensureDefaultWorkspace,
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        setConfirmCloseOpen(true);
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => unlisten?.();
  }, []);

  async function handleConfirmClose() {
    setConfirmCloseOpen(false);
    await getCurrentWindow().destroy();
  }

  useAutoUpdateCheck();

  const repairMutation = useMutation({
    mutationFn: repairMigrationChecksums,
    onSuccess: async (result) => {
      if (result.repairedVersions.length === 0) {
        showError(result.message);
        return;
      }
      showSuccess(result.message);
      // A full restart is deliberate, not just refetch(): tauri-plugin-sql
      // only validates migration checksums on the first Database.load()
      // call of a process — a same-process retry silently skips
      // validation instead of re-checking, so restarting is the only way
      // to confirm the repair actually took.
      await relaunch();
    },
    onError: (err) => showError(`Repair failed: ${describeError(err)}`),
  });

  const closeConfirmAlert = (
    <Alert
      isOpen={confirmCloseOpen}
      icon="log-out"
      intent={Intent.PRIMARY}
      confirmButtonText="Quit"
      cancelButtonText="Cancel"
      onConfirm={handleConfirmClose}
      onCancel={() => setConfirmCloseOpen(false)}
      canOutsideClickCancel
    >
      <p>Quit Syntrok InfraNet?</p>
    </Alert>
  );

  if (isError) {
    return (
      <CenteredShell dark={isDark}>
        <NonIdealState
          icon="error"
          title="Could not start the app"
          description={String(error)}
          action={
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <Button text="Retry" onClick={() => refetch()} />
              {isMigrationChecksumError(error) && (
                <Button
                  text="Repair Database"
                  intent={Intent.WARNING}
                  loading={repairMutation.isPending}
                  onClick={() => repairMutation.mutate()}
                />
              )}
            </div>
          }
        />
        {closeConfirmAlert}
      </CenteredShell>
    );
  }

  if (isLoading || !workspace) {
    return (
      <CenteredShell dark={isDark}>
        <Spinner size={32} />
        {closeConfirmAlert}
      </CenteredShell>
    );
  }

  return (
    <div
      className={classNames("app-shell", { [Classes.DARK]: isDark })}
      style={{
        display: "flex",
        padding: 0,
        ...shellBackground,
      }}
    >
      <Sidebar />
      <div
        className="scroll-area"
        style={{ flex: 1, padding: "0 32px 28px", overflow: "auto" }}
      >
        <Outlet
          context={{ workspaceId: workspace.id } satisfies LayoutContext}
        />
      </div>
      {closeConfirmAlert}
    </div>
  );
}

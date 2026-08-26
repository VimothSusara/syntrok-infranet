import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { useEffectiveDarkMode } from "../lib/theme";
import { ensureDefaultWorkspace } from "../domain/workspaces";
import { queryKeys } from "../domain/queryKeys";
import { Sidebar } from "../components/Sidebar";
import { useAutoUpdateCheck } from "../lib/useAutoUpdateChack";

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
      <div
        className={classNames("app-shell", { [Classes.DARK]: isDark })}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          ...shellBackground,
        }}
      >
        <NonIdealState
          icon="error"
          title="Could not start the app"
          description={String(error)}
          action={<Button text="Retry" onClick={() => refetch()} />}
        />
        {closeConfirmAlert}
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div
        className={classNames("app-shell", { [Classes.DARK]: isDark })}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          ...shellBackground,
        }}
      >
        <Spinner size={32} />
        {closeConfirmAlert}
      </div>
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

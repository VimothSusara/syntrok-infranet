import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Spinner, NonIdealState, Button, Classes } from "@blueprintjs/core";
import classNames from "clsx";
import { useEffectiveDarkMode } from "../lib/theme";
import { ensureDefaultWorkspace } from "../domain/workspaces";
import { queryKeys } from "../domain/queryKeys";
import { Sidebar } from "../components/Sidebar";

export interface LayoutContext {
  workspaceId: string;
}

export function AppLayout() {
  const isDark = useEffectiveDarkMode();
  const shellColors = {
    backgroundColor: isDark ? "#111418" : "#ffffff",
    color: isDark ? "#f6f7f9" : "#111418",
  };

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

  if (isError) {
    return (
      <div
        className={classNames("app-shell", { [Classes.DARK]: isDark })}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          ...shellColors,
        }}
      >
        <NonIdealState
          icon="error"
          title="Could not start the app"
          description={String(error)}
          action={<Button text="Retry" onClick={() => refetch()} />}
        />
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
          ...shellColors,
        }}
      >
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div
      className={classNames("app-shell", { [Classes.DARK]: isDark })}
      style={{ display: "flex", padding: 0, ...shellColors }}
    >
      <Sidebar />
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <Outlet
          context={{ workspaceId: workspace.id } satisfies LayoutContext}
        />
      </div>
    </div>
  );
}
